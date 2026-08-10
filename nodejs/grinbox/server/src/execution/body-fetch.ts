/**
 * The lazy Message-body fetch (data-model.md "messages": body fields are
 * nullable, lazy-fetched when an Operator that consumes the body needs it).
 * Runs in the worker, between loading the Message row and building the
 * Operator's `MessageView`:
 *
 *  1. **Need**: the run's config consumes the body (`operatorConsumesBody` —
 *     a `{{body}}` template placeholder, or a Rule `match` reading the `body`
 *     field). Otherwise the row passes through untouched.
 *  2. **Cache**: `body_fetched_at` non-NULL means a fetch was already
 *     attempted (possibly finding no body) — don't refetch (data-model.md
 *     `body_fetched_at` semantics).
 *  3. **Fetch**: `mailbox.fetch_body` through the run's metered client
 *     factory, so the fetch is Limit-checked, retried, evented, and metered
 *     against the Operator run that needed it — like every other Resource
 *     operation. On success the body is persisted to the `messages` row
 *     (`body_fetched_at` = now) and the updated fields are returned.
 *
 * A failed or Limit-skipped fetch degrades rather than failing the run: the
 * body fields stay NULL (a `{{body}}` placeholder renders empty, a `body`
 * match reads `""`), the metering layer has already recorded the
 * `resource_op_failed` / `resource_op_limited` event, and `body_fetched_at`
 * stays NULL so a later Triage retries the fetch.
 *
 * ## Single-flight
 *
 * The execution loop dispatches satisfied runs concurrently, so several runs
 * of one Triage can need the same Message's body at once. Fetches are
 * single-flighted per Message id: concurrent callers coalesce onto the one
 * in-flight fetch (so a Triage costs at most one `fetch_body` call — metered
 * against the run that initiated it), and a fresh `body_fetched_at` re-check
 * runs right before fetching so a caller holding a pre-fetch row snapshot
 * reuses the cached body instead of refetching. The in-flight entry is
 * removed once the fetch settles, so a degraded (failed/skipped) fetch still
 * leaves later Triages free to retry.
 */

import { operatorConfigSchemas, operatorConsumesBody } from '@grinbox/shared'
import type { OperatorTypeKey } from '@grinbox/shared'
import type { DB } from '../db/schema.js'
import type { MakeResourceClient } from '../operators/types.js'

/** The Message-row fields the body fetch reads and may update. */
export interface MessageBodyFields {
  readonly id: number
  readonly backend_message_id: string
  readonly body_text: string | null
  readonly body_html: string | null
  readonly body_fetched_at: number | null
}

/** The run fields that determine whether the body is needed. */
export interface BodyFetchRun {
  readonly type_key: string
  readonly op_config_json: string
}

/**
 * Whether this run's Operator consumes the Message body. Parses the config
 * leniently: an unknown type or invalid config reads no body (`runOperator`
 * fails such a run on its own resolution path; this helper must not).
 */
export function runConsumesBody(run: BodyFetchRun): boolean {
  if (!Object.hasOwn(operatorConfigSchemas, run.type_key)) {
    return false
  }
  const typeKey = run.type_key as OperatorTypeKey
  let raw: unknown
  try {
    raw = JSON.parse(run.op_config_json)
  } catch {
    return false
  }
  const parsed = operatorConfigSchemas[typeKey].safeParse(raw)
  if (!parsed.success) {
    return false
  }
  return operatorConsumesBody(typeKey, parsed.data)
}

/** The body fields a fetch resolves to. */
type MessageBody = Pick<MessageBodyFields, 'body_text' | 'body_html'>

/**
 * In-flight fetches keyed by Message id — the single-flight registry (module
 * header "Single-flight"). Entries are removed as each fetch settles, so the
 * map only ever holds fetches that are actually running.
 */
const inflightFetches = new Map<number, Promise<MessageBody>>()

/**
 * Ensure the Message body is cached when this run consumes it, and return the
 * body fields to build the `MessageView` from — updated when a fetch
 * succeeded, the stored ones otherwise. Concurrent callers for the same
 * Message share one fetch (module header "Single-flight"). Never throws for
 * fetch-level failures (see module header); only a DB error propagates.
 *
 * `inflight` is injectable for test isolation; production uses the
 * process-wide registry.
 */
export async function ensureMessageBody(
  db: DB,
  run: BodyFetchRun,
  row: MessageBodyFields,
  makeResourceClient: MakeResourceClient,
  inflight: Map<number, Promise<MessageBody>> = inflightFetches,
): Promise<MessageBody> {
  const stored = { body_text: row.body_text, body_html: row.body_html }
  if (row.body_fetched_at !== null) {
    return stored
  }
  if (!runConsumesBody(run)) {
    return stored
  }

  const existing = inflight.get(row.id)
  if (existing) {
    return existing
  }

  const fetch = fetchAndPersist(db, row, makeResourceClient, stored)
  inflight.set(row.id, fetch)
  try {
    return await fetch
  } finally {
    inflight.delete(row.id)
  }
}

/**
 * The single-flighted fetch body: re-check the cache against the live row
 * (the caller's snapshot may predate a fetch that completed after it was
 * loaded), then fetch, persist, and return.
 */
async function fetchAndPersist(
  db: DB,
  row: MessageBodyFields,
  makeResourceClient: MakeResourceClient,
  stored: MessageBody,
): Promise<MessageBody> {
  const fresh = await db
    .selectFrom('messages')
    .select(['body_text', 'body_html', 'body_fetched_at'])
    .where('id', '=', row.id)
    .executeTakeFirst()
  if (fresh && fresh.body_fetched_at !== null) {
    return { body_text: fresh.body_text, body_html: fresh.body_html }
  }

  const mailbox = makeResourceClient('mailbox', ['fetch_body'])
  const result = await mailbox.fetch_body({
    backendMessageId: row.backend_message_id,
  })
  if (result.outcome !== 'succeeded') {
    return stored
  }

  const fetched = {
    body_text: result.value.bodyText,
    body_html: result.value.bodyHtml,
  }
  await db
    .updateTable('messages')
    .set({ ...fetched, body_fetched_at: Math.floor(Date.now() / 1000) })
    .where('id', '=', row.id)
    .execute()
  return fetched
}
