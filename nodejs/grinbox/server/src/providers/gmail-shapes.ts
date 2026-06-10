/**
 * Gmail payload → {@link FetchedMessage} normalization. Kept separate from
 * `gmail-provider.ts` so the field-mapping quirks (which header carries the
 * `from`/`to`/`subject`, how `internalDate` becomes a Unix-seconds
 * `receivedAt`) are unit-testable in isolation from the History-API control
 * flow.
 */

import type { GmailMessagePayload } from './gmail-provider.js'
import type { FetchedMessage } from './provider.js'

/**
 * Normalize a metadata-format Gmail message into a {@link FetchedMessage}.
 *
 * - `from`/`to`/`subject` come from the (lowercased) RFC-822 headers; missing →
 *   null.
 * - `receivedAt` prefers Gmail's `internalDate` (epoch **ms** string →
 *   seconds), the most reliable received-time signal. Falls back to parsing the
 *   `Date` header. Null when neither is usable — the upsert backfills from
 *   `created_at` (data-model.md "messages" `received_at` rule).
 * - `bodyFetched` is false: the read path fetches metadata only; the body is
 *   lazy-fetched later by a body-consuming Operator.
 */
export function parseGmailMessage(payload: GmailMessagePayload): FetchedMessage {
  // Header lookups are by arbitrary lowercased name; missing keys are real.
  const headers: Record<string, string | undefined> = payload.headers
  return {
    backendMessageId: payload.id,
    backendThreadId: payload.threadId,
    from: headers.from ?? null,
    to: headers.to ?? null,
    subject: headers.subject ?? null,
    snippet: payload.snippet,
    receivedAt: deriveReceivedAt(payload.internalDate, headers.date ?? null),
    headers: payload.headers,
    bodyFetched: false,
  }
}

/**
 * Derive Unix-seconds received time. `internalDate` (epoch ms as a string) wins;
 * otherwise parse the RFC-822 `Date` header. Returns null when neither yields a
 * finite timestamp.
 */
function deriveReceivedAt(internalDate: string | null, dateHeader: string | null): number | null {
  if (internalDate !== null) {
    const ms = Number(internalDate)
    if (Number.isFinite(ms)) {
      return Math.floor(ms / 1000)
    }
  }
  if (dateHeader !== null) {
    const ms = Date.parse(dateHeader)
    if (Number.isFinite(ms)) {
      return Math.floor(ms / 1000)
    }
  }
  return null
}
