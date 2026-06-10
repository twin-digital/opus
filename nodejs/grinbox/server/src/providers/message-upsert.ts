/**
 * UPSERT a {@link FetchedMessage} into the `messages` table on
 * `(account_id, backend_message_id)` (data-model.md "messages").
 *
 * The poll loop calls this once per discovered candidate before enqueuing a
 * Triage. The returned `isNew` tells the loop whether this was a first
 * insert — i.e., whether to enqueue a Triage (a repeat fetch of an already-known
 * Message refreshes metadata but does not re-Triage on arrival).
 *
 * Data-model rules applied here:
 *  - `received_at` backfill: when the backend gave no reliable received time
 *    (`fetched.receivedAt === null`), store `created_at` so the
 *    `idx_messages_account_received` index covers every row.
 *  - `headers_json`: the normalized header map, serialized.
 *  - body semantics: the read path fetches metadata only, so on insert the body
 *    fields stay NULL and `body_fetched_at` stays NULL ("never attempted").
 *    `body_fetched_at` is set only when `fetched.bodyFetched` is true — i.e.,
 *    when a body fetch was actually attempted (NULL vs non-NULL is the
 *    "try fetching" vs "already attempted" signal the fetcher reads).
 *
 * A repeat UPSERT refreshes the mutable metadata columns but never rewrites
 * `created_at` (a snapshot of first-fetch time) and never clears a previously
 * set `body_fetched_at`/body back to NULL.
 */

import type { DB, MessagesTable } from '../db/schema.js'
import type { FetchedMessage } from './provider.js'

export interface UpsertResult {
  readonly messageId: number
  /** True when this UPSERT created the row (vs. updated an existing one). */
  readonly isNew: boolean
}

/**
 * UPSERT `fetched` into `messages` for `accountId`. `now` (Unix seconds)
 * defaults to the wall clock; tests pass a fixed value.
 */
export async function upsertMessage(
  db: DB,
  accountId: number,
  fetched: FetchedMessage,
  now: number = Math.floor(Date.now() / 1000),
): Promise<UpsertResult> {
  // received_at backfill: prefer the header time, else created_at (== now on
  // insert). On a repeat UPSERT the COALESCE in the conflict clause keeps the
  // existing received_at when the new fetch also lacks a header time.
  const receivedAt = fetched.receivedAt ?? now
  const headersJson = Object.keys(fetched.headers).length > 0 ? JSON.stringify(fetched.headers) : null
  const bodyFetchedAt = fetched.bodyFetched ? now : null
  const bodyText = fetched.bodyText ?? null
  const bodyHtml = fetched.bodyHtml ?? null

  // Detect insert-vs-update up front: SQLite's RETURNING doesn't distinguish the
  // two, so read the existing row's id within the same call sequence. The Daemon
  // is the sole writer, so there's no interleaving race here.
  const existing = await db
    .selectFrom('messages')
    .select('id')
    .where('account_id', '=', accountId)
    .where('backend_message_id', '=', fetched.backendMessageId)
    .executeTakeFirst()

  const row = await db
    .insertInto('messages')
    .values({
      account_id: accountId,
      backend_message_id: fetched.backendMessageId,
      backend_thread_id: fetched.backendThreadId,
      from_header: fetched.from,
      to_header: fetched.to,
      subject: fetched.subject,
      snippet: fetched.snippet,
      body_text: bodyText,
      body_html: bodyHtml,
      received_at: receivedAt,
      created_at: now,
      body_fetched_at: bodyFetchedAt,
      headers_json: headersJson,
    })
    .onConflict((oc) =>
      oc.columns(['account_id', 'backend_message_id']).doUpdateSet((eb) => ({
        backend_thread_id: eb.ref('excluded.backend_thread_id'),
        from_header: eb.ref('excluded.from_header'),
        to_header: eb.ref('excluded.to_header'),
        subject: eb.ref('excluded.subject'),
        snippet: eb.ref('excluded.snippet'),
        // Don't clobber a populated received_at with a backfilled one: keep the
        // existing value unless the new fetch carried a real header time.
        received_at: fetched.receivedAt ?? eb.ref('messages.received_at'),
        headers_json: eb.ref('excluded.headers_json'),
        // Only advance body fields when this fetch actually fetched a body;
        // otherwise preserve whatever a prior body fetch stored.
        body_text: fetched.bodyFetched ? eb.ref('excluded.body_text') : eb.ref('messages.body_text'),
        body_html: fetched.bodyFetched ? eb.ref('excluded.body_html') : eb.ref('messages.body_html'),
        body_fetched_at: fetched.bodyFetched ? eb.ref('excluded.body_fetched_at') : eb.ref('messages.body_fetched_at'),
      })),
    )
    .returning('id')
    .executeTakeFirstOrThrow()

  return { messageId: row.id, isNew: existing === undefined }
}

/**
 * Load a stored Message row for `messageId` as the raw `messages` shape, ready
 * to hand to {@link messageViewFromRow}. Exposed so the poll loop / tests can
 * confirm an upserted row round-trips through `messageViewFromRow`. A SELECT-all
 * row's `id` resolves to `number`; that function only reads fields, so the
 * resolved row is structurally compatible with the insert-side `MessagesTable`.
 */
export async function loadMessageRow(db: DB, messageId: number): Promise<MessagesTable> {
  const row = await db.selectFrom('messages').selectAll().where('id', '=', messageId).executeTakeFirstOrThrow()
  return row as unknown as MessagesTable
}
