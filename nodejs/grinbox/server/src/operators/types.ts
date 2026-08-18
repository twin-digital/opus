/**
 * The execution seam for Operators: the read-only view an Operator gets of a
 * Message, the metered Resource-client interfaces it calls, and the
 * `run`/registration shapes that compose onto `@grinbox/shared`'s declarative
 * registry.
 *
 * This file is the contract the real metered clients and the worker build
 * against, and it defines every metered client interface — they are the seam.
 */

import type { Contract, OperatorConfigFor, OperatorTypeKey, Resource, ResourceOpResult } from '@grinbox/shared'
import type { z } from 'zod'
import type { TriageEventInput } from '../pipeline/triage-event.js'
import type { MessagesTable } from '../db/schema.js'
import type { AccountCapabilityDeclaration } from '../providers/account-capabilities.js'

/**
 * The raw Message fields an Operator sees. Read-only projection of the
 * `messages` table (see {@link MessagesTable}), with header/thread access
 * normalized for Operator use:
 *  - `headers` is the parsed `headers_json` (lowercased header name → value),
 *    or an empty map when the Message has no stored headers.
 *  - `thread` carries the Provider's `thread_membership` output (d-7a8aoi4z)
 *    when the Message is part of a Thread: the backend thread id,
 *    whether the Message is a reply within its Thread (`isReply`), and the
 *    Thread's Message count (`messageCount`). It is `null` when the Message is
 *    not in a Thread — Operators must tolerate `null`.
 *
 * The full Message is always available to every Operator — there is no
 * per-field input declaration (r-sfvm6ib3).
 */
export interface MessageView {
  readonly id: number
  readonly accountId: number
  readonly backendMessageId: string
  readonly from: string | null
  /**
   * The sender email address parsed from the raw `from` header, lowercased
   * (e.g. `foo@bar.com`); `""` when the header is absent or unparseable. On a
   * header with multiple addresses, the first is taken. `from` itself stays the
   * raw header — use `from_email` for an exact-address match.
   */
  readonly from_email: string
  /**
   * The sender domain parsed from the raw `from` header, lowercased (the part
   * after `@`, e.g. `bar.com`); `""` when there is no parseable address/domain.
   */
  readonly from_domain: string
  readonly to: string | null
  readonly subject: string | null
  readonly snippet: string | null
  readonly bodyText: string | null
  readonly bodyHtml: string | null
  readonly receivedAt: number | null
  /**
   * Unix seconds grinbox took the Message in — the moment a delayed Archive
   * measures its delay from (d-grcdd4ov), and the same clock the digest's
   * coverage span reads.
   */
  readonly takenInAt: number
  readonly headers: ReadonlyMap<string, string>
  readonly thread: {
    readonly backendThreadId: string | null
    /** Whether this Message is a reply within its Thread. */
    readonly isReply: boolean
    /** Number of Messages in the Thread. */
    readonly messageCount: number
  } | null
}

/**
 * Extracts the first email address from a raw `From`/`To`-style header value.
 * Handles the `Display Name <addr@dom>` form and the bare `addr@dom` form, and
 * takes the first address when several are present. Returns `{ email, domain }`
 * lowercased, with `""` for either part that can't be parsed.
 */
export function parseAddress(raw: string | null | undefined): {
  email: string
  domain: string
} {
  if (!raw) {
    return { email: '', domain: '' }
  }
  // Prefer the angle-bracketed address (`Display Name <addr@dom>`); else fall
  // back to the first bare `addr@dom` token. Take the first address only.
  const bracketed = /<([^<>]+)>/.exec(raw)
  const candidate = bracketed ? bracketed[1] : (raw.split(',')[0] ?? '')
  const m = /[^\s<>,"@]+@[^\s<>,"@]+/.exec(candidate)
  if (!m) {
    return { email: '', domain: '' }
  }
  const email = m[0].toLowerCase()
  const at = email.lastIndexOf('@')
  const domain = at >= 0 && at < email.length - 1 ? email.slice(at + 1) : ''
  return { email, domain }
}

/**
 * Projects a `messages` row into the read-only {@link MessageView} an Operator
 * sees. `headers_json` is parsed best-effort: a malformed blob yields an empty
 * header map rather than throwing (a bad header cache must not fail a Triage).
 */
export function messageViewFromRow(row: MessagesTable): MessageView {
  const headers = new Map<string, string>()
  if (row.headers_json) {
    try {
      const parsed: unknown = JSON.parse(row.headers_json)
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') {
            headers.set(k.toLowerCase(), v)
          }
        }
      }
    } catch {
      // Malformed header cache: treat as no headers.
    }
  }
  const { email: fromEmail, domain: fromDomain } = parseAddress(row.from_header)
  return {
    id: row.id as unknown as number,
    accountId: row.account_id,
    backendMessageId: row.backend_message_id,
    from: row.from_header,
    from_email: fromEmail,
    from_domain: fromDomain,
    to: row.to_header,
    subject: row.subject,
    snippet: row.snippet,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    receivedAt: row.received_at,
    takenInAt: row.created_at as unknown as number,
    headers,
    thread:
      row.backend_thread_id ?
        // `isReply` / `messageCount` come from the Provider's
        // `thread_membership` output; the stored row carries only the backend
        // thread id.
        {
          backendThreadId: row.backend_thread_id,
          isReply: false,
          messageCount: 0,
        }
      : null,
  }
}

// --- Metered Resource clients (the seam) ---
//
// One typed method per Resource operation in `RESOURCE_OPERATIONS`, each
// returning `Promise<ResourceOpResult<T>>`. The client encapsulates Limit
// checks, retry policy, metering, and event accumulation (d-v5zamgjn,
// d-coeyvi2n); the Operator only ever sees the discriminated result.

/** Token / cost accounting returned alongside a successful LLM invocation. */
export interface LlmUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface LlmInvokeArgs {
  readonly modelId: string
  readonly prompt: string
  /** Optional max output tokens; the client picks a default otherwise. */
  readonly maxTokens?: number
}

/** Bedrock LLM client — used by LLM Tagger (O2) and Digest delivery. */
export interface LlmBedrockClient {
  invoke_model(args: LlmInvokeArgs): Promise<ResourceOpResult<{ text: string; usage: LlmUsage }>>
}

export interface PushoverSendArgs {
  readonly title?: string
  readonly message: string
  /** Optional supplementary URL shown on the notification (Pushover `url`). */
  readonly url?: string
  /** Display text for {@link url} (Pushover `url_title`); ignored without `url`. */
  readonly url_title?: string
}

/** Pushover client — used by Notify (O4). */
export interface PushoverClient {
  send_notification(args: PushoverSendArgs): Promise<ResourceOpResult<{ message_id: string }>>
}

export interface MailboxApplyCategoryArgs {
  readonly backendMessageId: string
  /** The Category name to apply (backends map it to their own mechanism —
   * Gmail: a label of the same name). */
  readonly category: string
}

export interface MailSendArgs {
  readonly to: string
  readonly subject: string
  /** The required plain-text rendition (d-rd986rrt). */
  readonly body: string
  /**
   * Optional rich rendition of the same content, sent beside the plain text in
   * one mail (d-rd986rrt, d-1oqjgi9m). Always permitted where sending is
   * declared — a backend that cannot offer alternatives sends the plain text
   * alone rather than failing (d-or4jo6s1).
   */
  readonly body_rich?: string
}

export interface MailboxFetchArgs {
  readonly backendMessageId: string
}

export interface MailboxArchiveArgs {
  readonly backendMessageId: string
}

/**
 * Filing a Message into a folder of the user's Account (d-jj2mymbi). `folder`
 * is named literally in the Operator's own configuration and matched against
 * the backend's folder names character for character (d-k8va629q) — grinbox
 * reads no hierarchy into it and creates nothing.
 */
export interface MailboxFileArgs {
  readonly backendMessageId: string
  readonly folder: string
}

export interface MailboxListArgs {
  readonly query: string
}

/**
 * A fetched Message body: the plain text (the `text/plain` part, else the
 * stripped `text/html` part) and the raw HTML part; null fields mean the
 * Message has no such content.
 */
export interface MailboxBodyResult {
  readonly bodyText: string | null
  readonly bodyHtml: string | null
}

/**
 * Mailbox client — operations on the Account's message store, used by Apply
 * Category (`apply_category`), Archive (`archive`), the lazy Message-body
 * fetch (`fetch_body`, invoked by the execution worker for a body-consuming
 * Operator run), and the Provider/poll path (`fetch_metadata`,
 * `list_messages`). Every declared operation in `RESOURCE_OPERATIONS.mailbox`
 * has a method here.
 */
export interface MailboxClient {
  apply_category(args: MailboxApplyCategoryArgs): Promise<ResourceOpResult<{ applied: boolean }>>
  archive(args: MailboxArchiveArgs): Promise<ResourceOpResult<{ archived: boolean }>>
  file(args: MailboxFileArgs): Promise<ResourceOpResult<{ filed: boolean }>>
  fetch_metadata(args: MailboxFetchArgs): Promise<ResourceOpResult<{ headers: Record<string, string> }>>
  fetch_body(args: MailboxFetchArgs): Promise<ResourceOpResult<MailboxBodyResult>>
  list_messages(args: MailboxListArgs): Promise<ResourceOpResult<{ ids: string[] }>>
}

/** Mail-sender client — outbound mail, used by Digest delivery (`send_message`). */
export interface MailSenderClient {
  send_message(args: MailSendArgs): Promise<ResourceOpResult<{ message_id: string }>>
}

/**
 * Map from a declared {@link Resource} to its metered-client interface. The
 * `resources` object handed to an Operator's `run` is a subset of this keyed by
 * exactly the Resources the type declares in its Contract.
 */
export interface ResourceClients {
  llm_bedrock: LlmBedrockClient
  pushover_api: PushoverClient
  mailbox: MailboxClient
  mail_sender: MailSenderClient
}

/**
 * Factory the dispatcher calls once per declared Resource to obtain its metered
 * client. Dependency-injected so the real clients OR a test fake plug in
 * without `runOperator` knowing which. The `operations` argument is the
 * declared operation set for that Resource (from the Contract) — the real
 * client exposes only those (d-v5zamgjn); the fake may honor or ignore it.
 *
 * The factory is also where the `signal` / `onEvent` / `onUsage` wiring lands:
 * the worker closes over those when it builds the factory, so `runOperator`
 * itself stays free of accumulator plumbing.
 */
export type MakeResourceClient = <R extends Resource>(resource: R, operations: readonly string[]) => ResourceClients[R]

// --- The notification cooldown gate (d-5amonj40, d-6ptxams7) ---

/**
 * The cooldown check's verdict. Suppression carries the kind and the run whose
 * push it deferred to (d-e9jslw4x); the interface resolves that run to its
 * Triage.
 */
export type CooldownVerdict =
  | { readonly suppressed: false }
  | {
      readonly suppressed: true
      readonly kind: string
      readonly deferred_to: { readonly triage_id: number; readonly operator_id: number }
    }

/**
 * The seam Notify consults before its push reaches any Resource. The check
 * runs BEFORE the metered client — a suppressed push reaches no resource and
 * counts against no Limit (d-6ptxams7). The gate is built per run by the
 * worker: `checkCooldown` also records the `resource_op_suppressed` event against the
 * run when it suppresses, and `recordPush` records a delivered kind-named push
 * so later runs can defer to it.
 */
export interface NotificationGate {
  checkCooldown(kind: string): Promise<CooldownVerdict>
  recordPush(kind: string): Promise<void>
}

/**
 * What an Operator's `run` receives. `config` is the type's parsed config;
 * `tags` are the input Tags in the current Triage's scope (key → value);
 * `resources` holds only the metered clients for the Resources the type
 * declares; `signal` is the Operator-timeout AbortSignal threaded into every
 * client. `notifications` is the cooldown gate the worker builds for Notify
 * runs; absent for other types (and in digest runs, which push nothing).
 */
export interface OperatorRunInput<K extends OperatorTypeKey> {
  readonly config: OperatorConfigFor<K>
  readonly message: MessageView
  readonly tags: ReadonlyMap<string, string>
  readonly resources: Partial<ResourceClients>
  readonly signal: AbortSignal
  readonly notifications?: NotificationGate
  /**
   * The Message's Account, with what its backend last declared it can carry
   * (d-bzw8qoiy). An Operator that behaves differently by Account — Set Aside
   * categorizes where it can and files where it cannot (d-hj9nac5f) — reads it
   * to choose. `capabilities` is null on an Account that has never polled.
   */
  readonly account?: RunAccount
}

/** The Account context a run is given. */
export interface RunAccount {
  readonly id: number
  readonly capabilities: AccountCapabilityDeclaration | null
}

/**
 * What an Operator's `run` returns: its output Tags, and any events it records
 * itself. Side effects (notifications, labels, sends) go through the metered
 * clients, which accumulate their own events; `events` is for what an Operator
 * concluded without reaching a Resource at all — a delayed Archive recording a
 * pending Archive rather than calling (d-grcdd4ov).
 */
export interface OperatorRunResult {
  readonly tags: readonly { key: string; value: string }[]
  readonly events?: readonly TriageEventInput[]
}

/**
 * The full per-type registration record: `@grinbox/shared`'s declarative
 * members (`configSchema`, `contractFromConfig`) plus the server-side
 * behavioral members (`code_version`, `run`,
 * `extractCredentialRefsFromOperatorConfig`).
 *
 * `code_version` is a monotonic string starting at `'1'` for every built-in
 * (see registry.ts for the convention). It identifies which code path a
 * snapshotted `triage_operator_runs.type_code_version` dispatches into.
 */
export interface OperatorType<K extends OperatorTypeKey = OperatorTypeKey> {
  readonly type_key: K
  readonly code_version: string
  readonly configSchema: z.ZodType<OperatorConfigFor<K>>
  readonly contractFromConfig: (config: OperatorConfigFor<K>) => Contract
  readonly run: (input: OperatorRunInput<K>) => Promise<OperatorRunResult>
  /**
   * The set of `credential_id` values this Operator's `config` references, used
   * to reconcile `operator_credential_references` at Operator save. Pure over
   * the parsed config.
   */
  readonly extractCredentialRefsFromOperatorConfig: (config: OperatorConfigFor<K>) => number[]
}
