/**
 * The underlying Gmail operations beneath the metering/Limit layer — the
 * transport half of Gmail's `mailbox` / `mail_sender` backends (see
 * `gmail-backend.ts`) and of the poll path's live client. The internals
 * (label-name resolution, MIME walk) are Gmail-specific by design; the
 * backend-neutral operation names live at the Resource seam, not here.
 *
 * Auth is an injected seam: the caller supplies a {@link GmailAuthProvider} that
 * yields a usable OAuth2 client (or, for tests, a mock). S6/M2 wire the real
 * token source (decrypting the `gmail_oauth` Credential and refreshing as
 * needed); S4 never reads the `credentials` table. This keeps the metering layer
 * decoupled from credential resolution.
 *
 * `googleapis` (`google.gmail`) is the transport. `google` is a value import
 * (used to construct the gmail service); the request/response shapes are typed
 * loosely against the parts we use to avoid coupling to googleapis' generated
 * surface.
 */

import { google } from 'googleapis'

/**
 * The OAuth2 client `google.gmail` accepts. Derived from the constructor rather
 * than from the `Auth` namespace `googleapis` re-exports: googleapis-common pins
 * an older google-auth-library than googleapis itself resolves, so the two
 * namespaces name structurally distinct classes.
 */
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

/** The authenticated OAuth2 client `google.gmail` accepts. */
export type GmailOAuth2Client = OAuth2Client

/**
 * Supplies the authenticated OAuth2 client for a given Gmail call. Async because
 * the real implementation (S6/M2) may refresh an expired access token before
 * returning. Injected so tests pass a stub and S4 stays free of credential
 * logic.
 */
export type GmailAuthProvider = () => Promise<GmailOAuth2Client>

export interface GmailDeps {
  readonly auth: GmailAuthProvider
  readonly signal: AbortSignal
}

/**
 * Fetch a Message's headers (the metadata-format `users.messages.get`). Returns
 * a lowercased-header-name → value map.
 */
export async function fetchMetadata(
  deps: GmailDeps,
  args: { backendMessageId: string },
): Promise<{ headers: Record<string, string> }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const res = await gmail.users.messages.get(
    {
      userId: 'me',
      id: args.backendMessageId,
      format: 'metadata',
    },
    { signal: deps.signal },
  )
  const headers: Record<string, string> = {}
  for (const h of res.data.payload?.headers ?? []) {
    if (h.name && typeof h.value === 'string') {
      headers[h.name.toLowerCase()] = h.value
    }
  }
  return { headers }
}

/** The extracted body content of a Message (see {@link fetchBody}). */
export interface GmailBody {
  /**
   * Plain text: the decoded `text/plain` part when present, else the stripped
   * `text/html` part, else null (the Message genuinely has no body).
   */
  readonly bodyText: string | null
  /** The decoded `text/html` part when present, else null. */
  readonly bodyHtml: string | null
}

/**
 * The parts of a Gmail message payload the body walk reads. Typed against just
 * what we use rather than googleapis' generated surface (module convention).
 * Exported for the body-shape survey script, which walks the same tree.
 */
export interface GmailPayloadPart {
  readonly mimeType?: string | null
  readonly filename?: string | null
  readonly body?: { readonly data?: string | null } | null
  readonly parts?: readonly GmailPayloadPart[] | null
}

/**
 * Fetch a Message's body (the full-format `users.messages.get`), walking the
 * MIME tree for the first non-attachment `text/plain` and `text/html` parts.
 * `bodyText` prefers the plain part and falls back to the HTML part stripped
 * to text ({@link htmlToText}); both are null for a Message with no body.
 * Part data is decoded as UTF-8 best-effort (Gmail does not surface the
 * part's charset in the payload).
 */
export async function fetchBody(deps: GmailDeps, args: { backendMessageId: string }): Promise<GmailBody> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const res = await gmail.users.messages.get(
    {
      userId: 'me',
      id: args.backendMessageId,
      format: 'full',
    },
    { signal: deps.signal },
  )
  return extractBody(res.data.payload ?? null)
}

/**
 * Extract {@link GmailBody} from a full-format payload. Depth-first over the
 * part tree, taking the FIRST `text/plain` and `text/html` parts that carry
 * inline data — for the common `multipart/alternative` layout these are the
 * canonical renditions; attachments (parts with a filename) are skipped.
 */
export function extractBody(payload: GmailPayloadPart | null): GmailBody {
  let text: string | null = null
  let html: string | null = null

  const visit = (part: GmailPayloadPart): void => {
    if (text !== null && html !== null) {
      return
    }
    const data = part.body?.data
    const isAttachment = typeof part.filename === 'string' && part.filename.length > 0
    if (typeof data === 'string' && data.length > 0 && !isAttachment) {
      if (part.mimeType === 'text/plain' && text === null) {
        text = decodeBase64Url(data)
      } else if (part.mimeType === 'text/html' && html === null) {
        html = decodeBase64Url(data)
      }
    }
    for (const child of part.parts ?? []) {
      visit(child)
    }
  }
  if (payload) {
    visit(payload)
  }

  const bodyHtml: string | null = html
  const bodyText: string | null = text ?? (bodyHtml !== null ? htmlToText(bodyHtml) : null)
  return { bodyText, bodyHtml }
}

/** Decode Gmail's URL-safe base64 part data to a UTF-8 string. */
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/**
 * Reduce an HTML body to readable plain text: drop `<style>`/`<script>`/
 * `<head>` blocks and comments, turn structural breaks (`<br>`, closing block
 * tags) into newlines, strip the remaining tags, decode the common entities,
 * and collapse the whitespace HTML rendering would collapse. A heuristic for
 * prompt/rule consumption, not a spec-complete HTML renderer.
 */
export function htmlToText(html: string): string {
  const withoutBlocks = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi, '')
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, '\n')
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ')
  const decoded = decodeHtmlEntities(withoutTags)
  return decoded
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Decode numeric and the common named HTML entities. */
function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}

/** List Message ids matching a Gmail search query (`users.messages.list`). */
export async function listMessages(deps: GmailDeps, args: { query: string }): Promise<{ ids: string[] }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const res = await gmail.users.messages.list({ userId: 'me', q: args.query }, { signal: deps.signal })
  const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  return { ids }
}

/**
 * Apply a label to a Message (`users.messages.modify` with `addLabelIds`).
 *
 * `args.label` is a label **name**, not an id — Operators and the Provider
 * categorize by human-readable Category name. Gmail's `messages.modify` needs
 * label **ids**, so this first resolves the name to an id, creating the label
 * when it does not yet exist (`users.labels.list` → match by name →
 * `users.labels.create` on miss). The resolved id is then added to the Message.
 *
 * Idempotent — re-applying a present label is a no-op on Gmail's side, and an
 * already-existing label is reused rather than re-created, which is why the
 * retry policy permits retries.
 */
export async function applyLabel(
  deps: GmailDeps,
  args: { backendMessageId: string; label: string },
): Promise<{ applied: boolean }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const labelId = await resolveLabelId(gmail, args.label, deps.signal)
  await gmail.users.messages.modify(
    {
      userId: 'me',
      id: args.backendMessageId,
      requestBody: { addLabelIds: [labelId] },
    },
    { signal: deps.signal },
  )
  return { applied: true }
}

/**
 * Archive a Message: remove it from the inbox (`users.messages.modify` with
 * `removeLabelIds: ['INBOX']`). The Message itself is untouched — it keeps its
 * other labels and stays in "All Mail"; only the inbox membership changes.
 *
 * Idempotent — removing a label the Message doesn't carry is a no-op on
 * Gmail's side, so archiving an already-archived Message succeeds cleanly,
 * which is why the retry policy permits retries.
 */
export async function archiveMessage(
  deps: GmailDeps,
  args: { backendMessageId: string },
): Promise<{ archived: boolean }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  await gmail.users.messages.modify(
    {
      userId: 'me',
      id: args.backendMessageId,
      requestBody: { removeLabelIds: ['INBOX'] },
    },
    { signal: deps.signal },
  )
  return { archived: true }
}

/** The minimal `google.gmail` surface `resolveLabelId` reads. */
type GmailService = ReturnType<typeof google.gmail>

/**
 * Resolve a label **name** to its Gmail label **id**, creating the label when it
 * is absent. Returns the id of the existing or newly-created label. A label
 * name compares case-sensitively as Gmail stores it.
 */
async function resolveLabelId(gmail: GmailService, name: string, signal: AbortSignal): Promise<string> {
  const list = await gmail.users.labels.list({ userId: 'me' }, { signal })
  for (const label of list.data.labels ?? []) {
    if (label.name === name && typeof label.id === 'string') {
      return label.id
    }
  }
  const created = await gmail.users.labels.create(
    {
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    },
    { signal },
  )
  const id = created.data.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`Gmail label create for '${name}' returned no id`)
  }
  return id
}

/**
 * Send an email (`users.messages.send` with a base64url RFC822 raw body).
 * Non-idempotent — the retry policy is no-retry, so a transient failure is
 * surfaced rather than risking a double-send.
 */
/**
 * RFC 2047 "encoded-word" for a header value with non-ASCII characters
 * (`=?UTF-8?B?...?=`); pure-ASCII values pass through unchanged. Without this,
 * a subject containing e.g. an em dash arrives mojibake'd at clients that
 * parse the raw header as ASCII/Latin-1.
 */
export function encodeHeaderValue(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII printable range check
  if (/^[\x20-\x7e]*$/.test(value)) {
    return value
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export async function sendMessage(
  deps: GmailDeps,
  args: { to: string; subject: string; body: string },
): Promise<{ message_id: string }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const raw = Buffer.from(
    [
      `To: ${args.to}`,
      `Subject: ${encodeHeaderValue(args.subject)}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(args.body, 'utf8').toString('base64'),
    ].join('\r\n'),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }, { signal: deps.signal })
  return { message_id: res.data.id ?? '' }
}
