/**
 * `/api/messages` — the Inbox browser + Message detail (ui-design.md "Inbox /
 * Message browser" and "Message detail").
 *
 *  - `GET /api/messages` — paginated Inbox. Filters: `accountId`, `pipelineId`,
 *    `status` (latest Triage status), `tagKey` (+ optional `tagValue`)
 *    presence, `dateFrom`/`dateTo` (UNIX seconds over `received_at`), and `q`
 *    (substring over from/subject/snippet). Each row carries from/subject/
 *    snippet/received time, the latest Triage's status, and the **current Tags**
 *    via `messages → current_triages → tags`. Ordered by `received_at DESC`
 *    (NULL last, per the schema's index convention). `limit`/`offset` paginate.
 *  - `GET /api/messages/:id` — detail. The Message header/body plus its full
 *    **Triage history** (most-recent-first), each Triage carrying its
 *    `triage_operator_runs`, `triage_events`, and `tags` inline. "Current Tags
 *    with provenance" is the Tag set of the message's `current_triages` entry,
 *    each Tag annotated with the Triage + Operator that produced it.
 *
 * "Current Tags" semantics: a Message can be current under more than one
 * Pipeline (one `current_triages` row per `(message, pipeline)`). The Inbox row
 * aggregates Tags across all of a Message's current Triages; when `pipelineId`
 * is filtered, only that Pipeline's current Triage contributes, and a Message
 * with no current Triage in that Pipeline is excluded.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { z } from 'zod'
import type { ApiDeps } from './deps.js'

export interface CurrentTag {
  readonly key: string
  readonly value: string
  /** The Triage whose settled output this Tag belongs to. */
  readonly triage_id: number
  /** The Operator run that produced it. */
  readonly operator_id: number
  /** The Pipeline the producing Triage ran under. */
  readonly pipeline_id: number
}

export interface MessageRow {
  readonly id: number
  readonly account_id: number
  readonly from_header: string | null
  readonly subject: string | null
  readonly snippet: string | null
  readonly received_at: number | null
  /** Backend disposition (`present|archived|trashed|spam|deleted`). */
  readonly source_state: string
  /** Latest Triage status across the Message's current Triages, if any. */
  readonly latest_triage_status: string | null
  readonly current_tags: readonly CurrentTag[]
}

export interface MessageListResponse {
  readonly messages: readonly MessageRow[]
  readonly page: {
    readonly limit: number
    readonly offset: number
    readonly total: number
  }
}

const listQuery = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  pipelineId: z.coerce.number().int().positive().optional(),
  status: z.enum(['running', 'completed', 'partial', 'failed']).optional(),
  tagKey: z.string().min(1).optional(),
  tagValue: z.string().min(1).optional(),
  dateFrom: z.coerce.number().int().optional(),
  dateTo: z.coerce.number().int().optional(),
  q: z.string().min(1).optional(),
  // Backend disposition filter. Defaults to `present` so the Inbox mirrors the
  // live inbox; `all` drops the filter (show archived/trashed/deleted too), or
  // pass a specific state.
  sourceState: z.enum(['present', 'archived', 'trashed', 'spam', 'deleted', 'all']).default('present'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const idParam = z.object({ id: z.coerce.number().int().positive() })

export function createMessagesRoutes(deps: ApiDeps) {
  return new Hono()
    .get('/', zValidator('query', listQuery), async (c) => {
      const f = c.req.valid('query')

      // Base predicate over messages joined to their current Triages. A message
      // qualifies if it has at least one current_triages row matching the
      // pipeline/status/tag filters (or, when none of those are set, any
      // message, current-triaged or not). We express the row set as a filtered
      // selection of message ids, then hydrate.
      const filteredIds = await selectMatchingMessageIds(deps, f)

      const total = filteredIds.length
      const pageIds = filteredIds.slice(f.offset, f.offset + f.limit)
      if (pageIds.length === 0) {
        return c.json<MessageListResponse>({
          messages: [],
          page: { limit: f.limit, offset: f.offset, total },
        })
      }

      const messageRows = await deps.db
        .selectFrom('messages')
        .where('id', 'in', pageIds)
        .select(['id', 'account_id', 'from_header', 'subject', 'snippet', 'received_at', 'source_state'])
        .execute()

      const tagsByMessage = await loadCurrentTags(deps, pageIds, f.pipelineId)
      const statusByMessage = await loadLatestStatus(deps, pageIds, f.pipelineId)

      const byId = new Map(messageRows.map((m) => [m.id, m]))
      // Preserve the received_at DESC order from the id selection.
      const messages: MessageRow[] = pageIds
        .map((id) => byId.get(id))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
        .map((m) => ({
          id: m.id,
          account_id: m.account_id,
          from_header: m.from_header,
          subject: m.subject,
          snippet: m.snippet,
          received_at: m.received_at,
          source_state: m.source_state,
          latest_triage_status: statusByMessage.get(m.id) ?? null,
          current_tags: tagsByMessage.get(m.id) ?? [],
        }))

      return c.json<MessageListResponse>({
        messages,
        page: { limit: f.limit, offset: f.offset, total },
      })
    })
    .get('/:id', zValidator('param', idParam), async (c) => {
      const { id } = c.req.valid('param')
      const message = await deps.db
        .selectFrom('messages')
        .where('id', '=', id)
        .select([
          'id',
          'account_id',
          'backend_message_id',
          'backend_thread_id',
          'from_header',
          'to_header',
          'subject',
          'snippet',
          'body_text',
          'body_html',
          'received_at',
          'created_at',
          'body_fetched_at',
          'source_state',
        ])
        .executeTakeFirst()
      if (!message) {
        return c.json({ error: 'message_not_found' }, 404)
      }

      // Current Tags with provenance (across every Pipeline this Message is
      // current under).
      const currentTagsMap = await loadCurrentTags(deps, [id], undefined)
      const currentTags = currentTagsMap.get(id) ?? []

      // Triage history, most recent first.
      const triages = await deps.db
        .selectFrom('triages')
        .where('message_id', '=', id)
        .select([
          'id',
          'pipeline_id',
          'triggered_by',
          'actor_user_id',
          'started_at',
          'ended_at',
          'status',
          'error_summary',
        ])
        .orderBy('started_at', 'desc')
        .orderBy('id', 'desc')
        .execute()

      const triageIds = triages.map((t) => t.id)
      const runsByTriage = await loadRuns(deps, triageIds)
      const eventsByTriage = await loadEvents(deps, triageIds)
      const tagsByTriage = await loadTags(deps, triageIds)

      const triageHistory = triages.map((t) => ({
        id: t.id,
        pipeline_id: t.pipeline_id,
        triggered_by: t.triggered_by,
        actor_user_id: t.actor_user_id,
        started_at: t.started_at,
        ended_at: t.ended_at,
        status: t.status,
        error_summary: t.error_summary,
        operator_runs: runsByTriage.get(t.id) ?? [],
        events: eventsByTriage.get(t.id) ?? [],
        tags: tagsByTriage.get(t.id) ?? [],
      }))

      return c.json({
        message,
        current_tags: currentTags,
        triages: triageHistory,
      })
    })
}

type ListFilters = z.infer<typeof listQuery>

/**
 * Resolve the ordered (received_at DESC, NULL last) list of message ids that
 * match the filters. Done as an id-only pass so pagination is computed over the
 * full match set without hydrating every row.
 */
async function selectMatchingMessageIds(deps: ApiDeps, f: ListFilters): Promise<number[]> {
  let q = deps.db.selectFrom('messages').select('messages.id')

  if (f.accountId !== undefined) {
    q = q.where('messages.account_id', '=', f.accountId)
  }
  if (f.sourceState !== 'all') {
    q = q.where('messages.source_state', '=', f.sourceState)
  }
  if (f.dateFrom !== undefined) {
    q = q.where('messages.received_at', '>=', f.dateFrom)
  }
  if (f.dateTo !== undefined) {
    q = q.where('messages.received_at', '<=', f.dateTo)
  }
  if (f.q !== undefined) {
    const like = `%${escapeLike(f.q)}%`
    // `escape '\'` so `%`/`_`/`\` inside the query are matched literally.
    const likeExpr = (column: 'from_header' | 'subject' | 'snippet') =>
      sql<boolean>`${sql.ref(`messages.${column}`)} like ${like} escape '\\'`
    q = q.where((eb) => eb.or([likeExpr('from_header'), likeExpr('subject'), likeExpr('snippet')]))
  }

  // Pipeline / status / tag filters require an existing current_triages row.
  const needsCurrent = f.pipelineId !== undefined || f.status !== undefined || f.tagKey !== undefined

  if (needsCurrent) {
    q = q.where((eb) =>
      eb.exists(
        eb
          .selectFrom('current_triages as ct')
          .innerJoin('triages as t', 't.id', 'ct.triage_id')
          .select(sql`1`.as('one'))
          .whereRef('ct.message_id', '=', 'messages.id')
          .$if(f.pipelineId !== undefined, (qb) => qb.where('ct.pipeline_id', '=', f.pipelineId as number))
          .$if(f.status !== undefined, (qb) => qb.where('t.status', '=', f.status as ListFilters['status'] & string))
          .$if(f.tagKey !== undefined, (qb) =>
            qb.where((eb2) =>
              eb2.exists(
                eb2
                  .selectFrom('tags as tg')
                  .select(sql`1`.as('one'))
                  .whereRef('tg.triage_id', '=', 'ct.triage_id')
                  .where('tg.key', '=', f.tagKey as string)
                  .$if(f.tagValue !== undefined, (qb2) => qb2.where('tg.value', '=', f.tagValue as string)),
              ),
            ),
          ),
      ),
    )
  }

  const rows = await q
    // NULL received_at sorts last under DESC in SQLite's default; make it
    // explicit so the ordering is stable regardless of backend.
    .orderBy(sql`messages.received_at is null`, 'asc')
    .orderBy('messages.received_at', 'desc')
    .orderBy('messages.id', 'desc')
    .execute()
  return rows.map((r) => r.id)
}

/**
 * Load current Tags (with provenance) for a set of messages, keyed by message
 * id. When `pipelineId` is set, only that Pipeline's current Triage
 * contributes; otherwise Tags from every current Triage of the Message are
 * merged.
 */
async function loadCurrentTags(
  deps: ApiDeps,
  messageIds: readonly number[],
  pipelineId: number | undefined,
): Promise<Map<number, CurrentTag[]>> {
  const out = new Map<number, CurrentTag[]>()
  if (messageIds.length === 0) {
    return out
  }

  let q = deps.db
    .selectFrom('current_triages as ct')
    .innerJoin('tags as tg', 'tg.triage_id', 'ct.triage_id')
    .where('ct.message_id', 'in', messageIds)
    .select([
      'ct.message_id as message_id',
      'ct.pipeline_id as pipeline_id',
      'tg.triage_id as triage_id',
      'tg.operator_id as operator_id',
      'tg.key as key',
      'tg.value as value',
    ])
  if (pipelineId !== undefined) {
    q = q.where('ct.pipeline_id', '=', pipelineId)
  }
  const rows = await q.orderBy('tg.key', 'asc').execute()
  for (const r of rows) {
    const list = out.get(r.message_id) ?? []
    list.push({
      key: r.key,
      value: r.value,
      triage_id: r.triage_id,
      operator_id: r.operator_id,
      pipeline_id: r.pipeline_id,
    })
    out.set(r.message_id, list)
  }
  return out
}

/**
 * Latest current-Triage status per message. With `pipelineId` set, the status
 * of that Pipeline's current Triage; otherwise the status of the
 * most-recently-started current Triage across Pipelines.
 */
async function loadLatestStatus(
  deps: ApiDeps,
  messageIds: readonly number[],
  pipelineId: number | undefined,
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (messageIds.length === 0) {
    return out
  }

  let q = deps.db
    .selectFrom('current_triages as ct')
    .innerJoin('triages as t', 't.id', 'ct.triage_id')
    .where('ct.message_id', 'in', messageIds)
    .select(['ct.message_id as message_id', 'ct.triage_started_at as started_at', 't.status as status'])
  if (pipelineId !== undefined) {
    q = q.where('ct.pipeline_id', '=', pipelineId)
  }
  // Order so the most-recently-started current Triage wins per message.
  const rows = await q.orderBy('ct.triage_started_at', 'asc').execute()
  for (const r of rows) {
    // Later rows (more recent started_at) overwrite earlier ones.
    out.set(r.message_id, r.status)
  }
  return out
}

export interface OperatorRunDetail {
  readonly operator_id: number
  readonly type_key: string
  readonly type_code_version: string
  readonly status: string
  readonly started_at: number | null
  readonly finished_at: number | null
  readonly duration_ms: number | null
  readonly skip_reason: string | null
  readonly error_summary: string | null
  readonly resource_usage_json: string | null
}

async function loadRuns(deps: ApiDeps, triageIds: readonly number[]): Promise<Map<number, OperatorRunDetail[]>> {
  const out = new Map<number, OperatorRunDetail[]>()
  if (triageIds.length === 0) {
    return out
  }
  const rows = await deps.db
    .selectFrom('triage_operator_runs')
    .where('triage_id', 'in', triageIds)
    .select([
      'triage_id',
      'operator_id',
      'type_key',
      'type_code_version',
      'status',
      'started_at',
      'finished_at',
      'duration_ms',
      'skip_reason',
      'error_summary',
      'resource_usage_json',
    ])
    .orderBy('triage_id', 'asc')
    .orderBy('operator_id', 'asc')
    .execute()
  for (const r of rows) {
    const list = out.get(r.triage_id) ?? []
    list.push({
      operator_id: r.operator_id,
      type_key: r.type_key,
      type_code_version: r.type_code_version,
      status: r.status,
      started_at: r.started_at,
      finished_at: r.finished_at,
      duration_ms: r.duration_ms,
      skip_reason: r.skip_reason,
      error_summary: r.error_summary,
      resource_usage_json: r.resource_usage_json,
    })
    out.set(r.triage_id, list)
  }
  return out
}

export interface TriageEventDetail {
  readonly operator_id: number
  readonly sequence_num: number
  readonly event_type: string
  readonly details_json: string | null
  readonly recorded_at: number
}

async function loadEvents(deps: ApiDeps, triageIds: readonly number[]): Promise<Map<number, TriageEventDetail[]>> {
  const out = new Map<number, TriageEventDetail[]>()
  if (triageIds.length === 0) {
    return out
  }
  const rows = await deps.db
    .selectFrom('triage_events')
    .where('triage_id', 'in', triageIds)
    .select(['triage_id', 'operator_id', 'sequence_num', 'event_type', 'details_json', 'recorded_at'])
    .orderBy('triage_id', 'asc')
    .orderBy('sequence_num', 'asc')
    .execute()
  for (const r of rows) {
    const list = out.get(r.triage_id) ?? []
    list.push({
      operator_id: r.operator_id,
      sequence_num: r.sequence_num,
      event_type: r.event_type,
      details_json: r.details_json,
      recorded_at: r.recorded_at,
    })
    out.set(r.triage_id, list)
  }
  return out
}

export interface TriageTagDetail {
  readonly operator_id: number
  readonly key: string
  readonly value: string
}

async function loadTags(deps: ApiDeps, triageIds: readonly number[]): Promise<Map<number, TriageTagDetail[]>> {
  const out = new Map<number, TriageTagDetail[]>()
  if (triageIds.length === 0) {
    return out
  }
  const rows = await deps.db
    .selectFrom('tags')
    .where('triage_id', 'in', triageIds)
    .select(['triage_id', 'operator_id', 'key', 'value'])
    .orderBy('triage_id', 'asc')
    .orderBy('key', 'asc')
    .execute()
  for (const r of rows) {
    const list = out.get(r.triage_id) ?? []
    list.push({ operator_id: r.operator_id, key: r.key, value: r.value })
    out.set(r.triage_id, list)
  }
  return out
}

/** Escape SQLite LIKE wildcards so user `q` is matched literally. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
