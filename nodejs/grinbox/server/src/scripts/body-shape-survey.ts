/**
 * Body-shape survey — a read-mostly diagnostic that fetches a sample of real
 * Messages in full format and reports (a) every distinct MIME payload *shape*
 * the mailbox exhibits and (b) what `extractBody` makes of each, so the body
 * walk can be validated against real Gmail responses rather than hand-built
 * fixtures. With `--emit-fixtures`, each distinct shape is also written out as
 * a structure-preserving, content-free JSON fixture (real part tree; all data,
 * filenames, and identifiers replaced with synthetic values) for use in
 * committed `extractBody` tests.
 *
 * This is dev tooling, not part of the daemon. It talks to the Gmail API
 * directly (deliberately outside the Limits/metering layer) at a polite fixed
 * delay, and reads the State DB for the sample + credentials. The one write it
 * can perform is the same one the daemon performs: refreshing a near-expiry
 * access token persists the refreshed token.
 *
 * ## Usage
 *
 * Requires the daemon's environment: `GRINBOX_DB_PATH`, `GRINBOX_TOKEN_ENC_KEY`,
 * and `GRINBOX_OAUTH_CLIENT_ID` / `_SECRET` (token decrypt + refresh). On the
 * production host that is the environment `run-grinbox.sh` exports; run the
 * built script under it while the daemon is idle or stopped:
 *
 *   node packages/server/dist/scripts/body-shape-survey.js \
 *     --sample 120 --emit-fixtures /tmp/body-shapes
 *
 * Locally: `pnpm --filter @grinbox/server survey:body-shapes -- --db <path>`.
 *
 * Flags: `--sample <n>` messages (default 120, newest first with a per-sender-
 * domain cap of `--per-domain-cap <n>`, default 4, so one noisy sender cannot
 * crowd the sample), `--delay-ms <n>` between API calls (default 150),
 * `--emit-fixtures <dir>`, `--db <path>` (overrides `GRINBOX_DB_PATH`).
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { google } from 'googleapis'
import { loadConfig } from '../config.js'
import { makeEncryptor } from '../crypto/encryption.js'
import { closeDatabase, openDatabase } from '../db/connection.js'
import type { DB } from '../db/schema.js'
import { type GoogleOAuthClient, makeGoogleOAuthClient } from '../oauth/google-client.js'
import { resolveGmailAccessToken } from '../oauth/token-store.js'
import { type GmailBody, type GmailPayloadPart, extractBody } from '../resources/gmail.js'

// --- arg / env parsing ------------------------------------------------------

interface CliArgs {
  readonly dbPath: string | null
  readonly sample: number
  readonly perDomainCap: number
  readonly delayMs: number
  readonly fixturesDir: string | null
}

function parseArgs(argv: readonly string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const int = (flag: string, fallback: number): number => {
    const raw = get(flag)
    if (raw === undefined) {
      return fallback
    }
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${flag} must be a positive integer, got ${raw}`)
    }
    return n
  }
  return {
    dbPath: get('--db') ?? null,
    sample: int('--sample', 120),
    perDomainCap: int('--per-domain-cap', 4),
    delayMs: int('--delay-ms', 150),
    fixturesDir: get('--emit-fixtures') ?? null,
  }
}

// --- shape signatures -------------------------------------------------------

/**
 * A compact signature of a payload part tree: `mimeType` plus flags (`a` when
 * the part names a file, i.e. an attachment; `d` when it carries inline data),
 * children in brackets. Example:
 * `multipart/alternative[text/plain(d),text/html(d)]`.
 */
function shapeSignature(part: GmailPayloadPart | null): string {
  if (!part) {
    return '(no payload)'
  }
  const flags = [
    typeof part.filename === 'string' && part.filename.length > 0 ? 'a' : '',
    typeof part.body?.data === 'string' && part.body.data.length > 0 ? 'd' : '',
  ].join('')
  const self = `${part.mimeType ?? '?'}${flags ? `(${flags})` : ''}`
  const children = (part.parts ?? []).map((c) => shapeSignature(c))
  return children.length > 0 ? `${self}[${children.join(',')}]` : self
}

/** How `extractBody` resolved a payload. */
type Outcome = 'plain' | 'html_fallback' | 'empty'

function classify(body: GmailBody, payload: GmailPayloadPart | null): Outcome {
  if (body.bodyText === null) {
    return 'empty'
  }
  if (body.bodyHtml !== null && !payloadHasPlainData(payload)) {
    return 'html_fallback'
  }
  return 'plain'
}

function payloadHasPlainData(part: GmailPayloadPart | null): boolean {
  if (!part) {
    return false
  }
  const isAttachment = typeof part.filename === 'string' && part.filename.length > 0
  if (
    part.mimeType === 'text/plain' &&
    !isAttachment &&
    typeof part.body?.data === 'string' &&
    part.body.data.length > 0
  ) {
    return true
  }
  return (part.parts ?? []).some((c) => payloadHasPlainData(c))
}

// --- content-free fixture emission ------------------------------------------

/**
 * Rebuild a payload tree preserving only structure: mimeTypes, whether a part
 * names a file, whether it carries data, and the child layout. Data becomes a
 * synthetic base64url string, filenames become `attachment-<n>`; nothing from
 * the real message survives.
 */
function syntheticPayload(part: GmailPayloadPart, counter = { n: 0 }): GmailPayloadPart {
  const hasFile = typeof part.filename === 'string' && part.filename.length > 0
  const hasData = typeof part.body?.data === 'string' && part.body.data.length > 0
  if (hasFile) {
    counter.n += 1
  }
  return {
    mimeType: part.mimeType ?? null,
    filename: hasFile ? `attachment-${counter.n}` : '',
    body:
      hasData ?
        {
          data: Buffer.from(`synthetic ${part.mimeType ?? 'unknown'} content`, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_'),
        }
      : {},
    parts: (part.parts ?? []).map((c) => syntheticPayload(c, counter)),
  }
}

// --- sampling ---------------------------------------------------------------

interface SampledMessage {
  readonly id: number
  readonly account_id: number
  readonly backend_message_id: string
  readonly from_domain: string
}

async function sampleMessages(db: DB, args: CliArgs): Promise<SampledMessage[]> {
  const rows = await db
    .selectFrom('messages')
    .innerJoin('accounts', 'accounts.id', 'messages.account_id')
    .where('accounts.provider_type', '=', 'gmail')
    .select([
      'messages.id as id',
      'messages.account_id as account_id',
      'messages.backend_message_id as backend_message_id',
      'messages.from_header as from_header',
    ])
    .orderBy('messages.received_at', 'desc')
    .execute()

  const perDomain = new Map<string, number>()
  const picked: SampledMessage[] = []
  for (const row of rows) {
    if (picked.length >= args.sample) {
      break
    }
    const match = /@([^>\s]+)/.exec(row.from_header ?? '')
    const domain = (match?.[1] ?? '(unknown)').toLowerCase()
    const seen = perDomain.get(domain) ?? 0
    if (seen >= args.perDomainCap) {
      continue
    }
    perDomain.set(domain, seen + 1)
    picked.push({
      id: row.id,
      account_id: row.account_id,
      backend_message_id: row.backend_message_id,
      from_domain: domain,
    })
  }
  return picked
}

// --- survey -----------------------------------------------------------------

interface ShapeStats {
  count: number
  readonly exampleMessageIds: number[]
  readonly outcomes: Record<Outcome, number>
  examplePayload: GmailPayloadPart | null
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig(process.env)
  if (!config.oauthClientId || !config.oauthClientSecret) {
    throw new Error('GRINBOX_OAUTH_CLIENT_ID and GRINBOX_OAUTH_CLIENT_SECRET are required (token refresh)')
  }

  const db = openDatabase(args.dbPath ?? config.dbPath)
  const encryptor = makeEncryptor(config.tokenEncKey)
  // The redirect URI is unused by the refresh grant this script performs, but
  // the client config requires one.
  const googleClient: GoogleOAuthClient = makeGoogleOAuthClient({
    clientId: config.oauthClientId,
    clientSecret: config.oauthClientSecret,
    redirectUri: config.oauthRedirectUri,
  })

  const sample = await sampleMessages(db, args)
  console.log(
    `surveying ${sample.length} messages (cap ${args.perDomainCap}/sender-domain, ${args.delayMs}ms between calls)`,
  )

  const shapes = new Map<string, ShapeStats>()
  const failures: { messageId: number; error: string }[] = []
  const tokens = new Map<number, string>()

  for (const [i, msg] of sample.entries()) {
    try {
      let token = tokens.get(msg.account_id)
      if (token === undefined) {
        token = await resolveGmailAccessToken(db, encryptor, msg.account_id, googleClient)
        tokens.set(msg.account_id, token)
      }
      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: token })
      const gmail = google.gmail({ version: 'v1', auth })
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: msg.backend_message_id,
        format: 'full',
      })
      const payload = (res.data.payload ?? null) as GmailPayloadPart | null
      const sig = shapeSignature(payload)
      const outcome = classify(extractBody(payload), payload)

      let stats = shapes.get(sig)
      if (!stats) {
        stats = {
          count: 0,
          exampleMessageIds: [],
          outcomes: { plain: 0, html_fallback: 0, empty: 0 },
          examplePayload: payload,
        }
        shapes.set(sig, stats)
      }
      stats.count += 1
      stats.outcomes[outcome] += 1
      if (stats.exampleMessageIds.length < 5) {
        stats.exampleMessageIds.push(msg.id)
      }
    } catch (err) {
      failures.push({ messageId: msg.id, error: String(err) })
    }
    if (i < sample.length - 1) {
      await sleep(args.delayMs)
    }
    if ((i + 1) % 25 === 0) {
      console.log(`  ...${i + 1}/${sample.length}`)
    }
  }

  // --- report ---------------------------------------------------------------
  const bySize = [...shapes.entries()].sort((a, b) => b[1].count - a[1].count)
  console.log(`\n${bySize.length} distinct payload shapes:\n`)
  for (const [sig, stats] of bySize) {
    const o = stats.outcomes
    console.log(
      `${String(stats.count).padStart(4)}  plain=${o.plain} html_fallback=${o.html_fallback} empty=${o.empty}  examples=[${stats.exampleMessageIds.join(',')}]`,
    )
    console.log(`      ${sig}`)
  }
  const totals = { plain: 0, html_fallback: 0, empty: 0 }
  for (const [, s] of bySize) {
    totals.plain += s.outcomes.plain
    totals.html_fallback += s.outcomes.html_fallback
    totals.empty += s.outcomes.empty
  }
  console.log(
    `\ntotals: plain=${totals.plain} html_fallback=${totals.html_fallback} empty=${totals.empty} failures=${failures.length}`,
  )
  for (const f of failures) {
    console.log(`  FAILED message=${f.messageId}: ${f.error}`)
  }

  // --- fixtures -------------------------------------------------------------
  if (args.fixturesDir) {
    mkdirSync(args.fixturesDir, { recursive: true })
    for (const [sig, stats] of bySize) {
      if (!stats.examplePayload) {
        continue
      }
      const hash = createHash('sha256').update(sig).digest('hex').slice(0, 12)
      const file = join(args.fixturesDir, `shape-${hash}.json`)
      writeFileSync(
        file,
        `${JSON.stringify(
          {
            signature: sig,
            count: stats.count,
            payload: syntheticPayload(stats.examplePayload),
          },
          null,
          2,
        )}\n`,
      )
    }
    console.log(`\nwrote ${bySize.length} content-free shape fixtures to ${args.fixturesDir}`)
  }

  await closeDatabase(db)
}

main().catch((err: unknown) => {
  console.error('[body-shape-survey] failed:', err)
  process.exit(1)
})
