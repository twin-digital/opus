/**
 * The live {@link GmailProviderClient} implementation over `googleapis`,
 * authenticated by the Account's stored OAuth credential. This is the transport
 * the production poll loop uses; tests inject a mock `GmailProviderClient`
 * instead (see `gmail-provider.test.ts`), and this module's own test mocks
 * `googleapis` (mirroring `resources/gmail.ts`).
 *
 * ## Auth model
 *
 * Every method resolves a fresh access token through
 * {@link resolveGmailAccessToken} (refresh-before-expiry; `invalid_grant` →
 * needs-reauth) and sets it on a per-call `google.auth.OAuth2` client. Resolving
 * per call (rather than once at construction) means a long-lived Provider never
 * holds a stale token: a token that expires between two poll cycles is refreshed
 * on the next call. `resolveGmailAccessToken` does the caching (it returns the
 * stored token untouched until it nears expiry), so the per-call cost is a cheap
 * decrypt + clock comparison in the common case.
 *
 * The thrown {@link NeedsReauthError} / {@link NoGmailCredentialError} propagate
 * out of these methods unchanged: the poll cycle's `listCandidates` is the first
 * call, so a needs-reauth Account fails its cycle before any State-DB write and
 * is logged + skipped by the scheduler — its credential already soft-deleted, so
 * it stays in the needs-auth state until re-authorized (oauth-flow.md "Re-auth").
 *
 * ## Resources-layer reuse
 *
 * `listMessages` and `applyLabel` reuse `resources/gmail.ts` directly — their
 * shapes are exactly what the Provider needs. The message read does NOT: the
 * Provider needs the richer payload (threadId / snippet / internalDate), whereas
 * `resources/gmail.ts` `fetchMetadata` returns headers only. So `getMessage`
 * issues its own metadata-format `users.messages.get`; `getLatestHistoryId`,
 * `listHistory`, and `getThread` have no resources-layer equivalent and call
 * `googleapis` directly too.
 *
 * ## googleapis seam
 *
 * `google` is a value import (it constructs the OAuth2 client and the Gmail
 * service), per `verbatimModuleSyntax`. The History/Profile/Thread shapes are
 * read defensively against the parts we use rather than coupling to googleapis'
 * generated surface, matching `resources/gmail.ts`.
 */

import { type Auth, google } from 'googleapis'
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { resolveGmailAccessToken } from '../oauth/token-store.js'
import {
  type GmailOAuth2Client,
  applyLabel as applyLabelOp,
  listMessages as listMessagesOp,
} from '../resources/gmail.js'
import {
  type GmailHistoryPage,
  type GmailLabelEvent,
  type GmailListResult,
  type GmailMessagePayload,
  type GmailProviderClient,
  type GmailThread,
  HistoryIdExpiredError,
  isHistoryIdExpired,
} from './gmail-provider.js'

/** Dependencies the live Gmail client closes over per Account. */
export interface LiveGmailClientDeps {
  readonly db: DB
  readonly encryptor: Encryptor
  readonly googleClient: GoogleOAuthClient
  /** The Account id whose `gmail_oauth` credential authenticates these calls. */
  readonly accountId: number
}

/**
 * Build a live {@link GmailProviderClient} for one Account. Each method resolves
 * the Account's access token (refreshing if needed) and runs against an
 * authenticated Gmail service.
 *
 * The `gmail_api.*` read ops (`listMessages`, `fetchMetadata`, `applyLabel`)
 * reuse `resources/gmail.ts`; the History-API / Profile / Thread reads the poll
 * path additionally needs (`getLatestHistoryId`, `listHistory`, `getThread`,
 * and message-payload normalization) call `googleapis` directly here.
 */
export function makeLiveGmailClient(deps: LiveGmailClientDeps): GmailProviderClient {
  // The auth seam `resources/gmail.ts` expects: resolve a fresh token and hand
  // back an OAuth2 client carrying it. Async because the resolve may refresh.
  const auth = async (): Promise<GmailOAuth2Client> => {
    const accessToken = await resolveGmailAccessToken(deps.db, deps.encryptor, deps.accountId, deps.googleClient)
    const client: Auth.OAuth2Client = new google.auth.OAuth2()
    client.setCredentials({ access_token: accessToken })
    return client
  }

  // The poll path makes no Operator-timeout-bounded calls (it isn't an Operator
  // run), so there is no abort signal to thread through; an un-abortable signal
  // satisfies the `resources/gmail.ts` `GmailDeps` shape.
  const neverAborts = new AbortController().signal

  /** Build an authenticated Gmail service for a direct googleapis call. */
  const gmailService = async () => google.gmail({ version: 'v1', auth: await auth() })

  return {
    async listMessages(query: string): Promise<GmailListResult> {
      const { ids } = await listMessagesOp({ auth, signal: neverAborts }, { query })
      return { ids }
    },

    async listAllMessageIds(query: string): Promise<string[]> {
      const gmail = await gmailService()
      const ids: string[] = []
      let pageToken: string | undefined
      do {
        const res = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          pageToken,
        })
        for (const m of res.data.messages ?? []) {
          if (typeof m.id === 'string') {
            ids.push(m.id)
          }
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return ids
    },

    async getLatestHistoryId(): Promise<string> {
      const gmail = await gmailService()
      const res = await gmail.users.getProfile({ userId: 'me' })
      const historyId = res.data.historyId
      if (typeof historyId !== 'string' || historyId.length === 0) {
        throw new Error('Gmail profile did not include a historyId')
      }
      return historyId
    },

    async listHistory(startHistoryId: string, pageToken?: string): Promise<GmailHistoryPage> {
      const gmail = await gmailService()
      const res = await gmail.users.history
        .list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved', 'messageDeleted'],
          pageToken,
        })
        .catch((err: unknown) => {
          // A start historyId past Gmail's retention window surfaces as HTTP
          // 404; map it onto the dedicated error so `GmailProvider` runs its
          // query-based fallback.
          if (isHistoryIdExpired(err)) {
            throw new HistoryIdExpiredError()
          }
          throw err
        })
      const addedMessageIds: string[] = []
      const labelEvents: GmailLabelEvent[] = []
      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          const id = added.message?.id
          if (typeof id === 'string') {
            addedMessageIds.push(id)
          }
        }
        // One merged label event per Message in the record (Gmail splits the
        // same Message's adds/removes across `labelsAdded`/`labelsRemoved`).
        const byMessage = new Map<string, { added: string[]; removed: string[] }>()
        const entryFor = (id: string) => {
          let e = byMessage.get(id)
          if (e === undefined) {
            e = { added: [], removed: [] }
            byMessage.set(id, e)
          }
          return e
        }
        for (const la of record.labelsAdded ?? []) {
          const id = la.message?.id
          if (typeof id === 'string') {
            for (const l of la.labelIds ?? []) {
              entryFor(id).added.push(l)
            }
          }
        }
        for (const lr of record.labelsRemoved ?? []) {
          const id = lr.message?.id
          if (typeof id === 'string') {
            for (const l of lr.labelIds ?? []) {
              entryFor(id).removed.push(l)
            }
          }
        }
        for (const [id, { added, removed }] of byMessage) {
          labelEvents.push({
            backendMessageId: id,
            addedLabelIds: added,
            removedLabelIds: removed,
            deleted: false,
          })
        }
        for (const del of record.messagesDeleted ?? []) {
          const id = del.message?.id
          if (typeof id === 'string') {
            labelEvents.push({
              backendMessageId: id,
              addedLabelIds: [],
              removedLabelIds: [],
              deleted: true,
            })
          }
        }
      }
      // `historyId` on the response is the newest seen; fall back to the start
      // value so the cursor never regresses if the page omits it.
      const historyId = typeof res.data.historyId === 'string' ? res.data.historyId : startHistoryId
      return {
        addedMessageIds,
        labelEvents,
        historyId,
        nextPageToken: res.data.nextPageToken ?? undefined,
      }
    },

    async getMessage(backendMessageId: string): Promise<GmailMessagePayload> {
      const gmail = await gmailService()
      const res = await gmail.users.messages.get(
        { userId: 'me', id: backendMessageId, format: 'metadata' },
        { signal: neverAborts },
      )
      const headers: Record<string, string> = {}
      for (const h of res.data.payload?.headers ?? []) {
        if (h.name && typeof h.value === 'string') {
          headers[h.name.toLowerCase()] = h.value
        }
      }
      return {
        id: res.data.id ?? backendMessageId,
        threadId: res.data.threadId ?? null,
        snippet: res.data.snippet ?? null,
        internalDate: res.data.internalDate ?? null,
        headers,
      }
    },

    async getThread(backendThreadId: string): Promise<GmailThread> {
      const gmail = await gmailService()
      const res = await gmail.users.threads.get(
        { userId: 'me', id: backendThreadId, format: 'metadata' },
        { signal: neverAborts },
      )
      const messageIds: string[] = []
      for (const m of res.data.messages ?? []) {
        if (typeof m.id === 'string') {
          messageIds.push(m.id)
        }
      }
      return { id: res.data.id ?? backendThreadId, messageIds }
    },

    async applyLabel(backendMessageId: string, label: string): Promise<void> {
      await applyLabelOp({ auth, signal: neverAborts }, { backendMessageId, label })
    },
  }
}
