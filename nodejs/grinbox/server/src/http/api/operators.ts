/**
 * `/api/operators` — Operator-editor support endpoints (ui-design.md §4
 * "Operator editor").
 *
 *  - `POST /api/operators/preview` — the Rule-based Tagger **live preview**.
 *    Evaluates a *draft* config against the most-recent Messages currently
 *    triaged under a Pipeline and returns the impact diff: which Messages'
 *    output Tag value would change. Read-only — no writes, no external calls.
 *    Powers the editor's live-preview pane (M4).
 *
 * The preview reuses {@link evaluateRuleBasedTagger} — the same pure
 * first-match-wins decision the live Operator's `run` uses — so the preview can
 * never diverge from what the Operator would actually produce.
 */

import { ruleBasedTaggerConfigSchema } from '@twin-digital/grinbox-shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { z } from 'zod'
import type { MessagesTable } from '../../db/schema.js'
import { MatchExpressionError } from '../../operators/built-ins/match-expression.js'
import { evaluateRuleBasedTagger } from '../../operators/built-ins/rule-based-tagger.js'
import { messageViewFromRow } from '../../operators/types.js'
import { type ApiDeps, resolveActingUserId } from './deps.js'

/**
 * One evaluated Message in the preview: its header fields plus the diff between
 * the Tag value the draft config would emit (`draft_value`) and the value
 * currently stored in that Message's Triage for the draft's `output_tag_key`
 * (`current_value`, `null` when the key is new). `changed` is true iff they
 * differ.
 */
export interface PreviewResult {
  readonly message_id: number
  readonly from: string | null
  readonly subject: string | null
  readonly snippet: string | null
  readonly received_at: number | null
  /** The current value of `output_tag_key`, or `null` when the key is absent. */
  readonly current_value: string | null
  /** The value the draft config would emit for this Message. */
  readonly draft_value: string
  readonly changed: boolean
}

export interface PreviewResponse {
  /** Every evaluated Message (the UI filters / marks the changed ones). */
  readonly results: readonly PreviewResult[]
  readonly changed_count: number
  readonly total_evaluated: number
}

const previewBody = z.object({
  pipeline_id: z.number().int().positive(),
  /**
   * The draft Rule-based Tagger config. Validated against
   * `ruleBasedTaggerConfigSchema`; any other Operator shape / invalid config is
   * rejected with a 400 by the zod-validator.
   */
  config: ruleBasedTaggerConfigSchema,
  limit: z.number().int().min(1).max(200).default(50),
})

export function createOperatorsRoutes(deps: ApiDeps) {
  return new Hono().post('/preview', zValidator('json', previewBody), async (c) => {
    const userId = await resolveActingUserId(deps.db)
    if (userId === null) {
      return c.json({ error: 'no_user' }, 400)
    }
    const { pipeline_id, config, limit } = c.req.valid('json')

    // The most-recent `limit` Messages currently triaged under this Pipeline
    // (one current_triages row per (message, pipeline)), newest first.
    const currentRows = await deps.db
      .selectFrom('current_triages as ct')
      .innerJoin('messages as m', 'm.id', 'ct.message_id')
      .where('ct.pipeline_id', '=', pipeline_id)
      .select([
        'm.id as id',
        'm.account_id as account_id',
        'm.backend_message_id as backend_message_id',
        'm.backend_thread_id as backend_thread_id',
        'm.from_header as from_header',
        'm.to_header as to_header',
        'm.subject as subject',
        'm.snippet as snippet',
        'm.body_text as body_text',
        'm.body_html as body_html',
        'm.received_at as received_at',
        'm.created_at as created_at',
        'm.body_fetched_at as body_fetched_at',
        'm.headers_json as headers_json',
        'ct.triage_id as triage_id',
      ])
      // NULL received_at sorts last under DESC; make it explicit so ordering
      // is stable regardless of backend (mirrors `messages.ts`).
      .orderBy(sql`m.received_at is null`, 'asc')
      .orderBy('m.received_at', 'desc')
      .orderBy('m.id', 'desc')
      .limit(limit)
      .execute()

    if (currentRows.length === 0) {
      return c.json<PreviewResponse>({
        results: [],
        changed_count: 0,
        total_evaluated: 0,
      })
    }

    // Load the input Tags for each evaluated Triage (the Triage's existing
    // Tag set), grouped by triage id.
    const triageIds = currentRows.map((r) => r.triage_id)
    const tagRows = await deps.db
      .selectFrom('tags')
      .where('triage_id', 'in', triageIds)
      .select(['triage_id', 'key', 'value'])
      .execute()
    const tagsByTriage = new Map<number, Map<string, string>>()
    for (const t of tagRows) {
      let m = tagsByTriage.get(t.triage_id)
      if (!m) {
        m = new Map<string, string>()
        tagsByTriage.set(t.triage_id, m)
      }
      m.set(t.key, t.value)
    }

    const results: PreviewResult[] = []
    let changedCount = 0
    try {
      for (const row of currentRows) {
        // `messageViewFromRow` is typed against the insert-side
        // `MessagesTable` (Generated/branded columns); the SELECT yields the
        // resolved values, so cast through `unknown` as the worker does.
        const messageView = messageViewFromRow(row as unknown as MessagesTable)
        // Input context = the Triage's full existing Tag set. The draft's
        // `match` references input keys (`tag.<key>`) — other Operators'
        // outputs — and the Tagger writes a *separate* `output_tag_key`, so
        // feeding the full current Tag set as input is safe: the value being
        // recomputed lives under a distinct key and never feeds itself.
        const inputTags = tagsByTriage.get(row.triage_id) ?? new Map<string, string>()
        const draftValue = evaluateRuleBasedTagger(config, messageView, inputTags)
        const currentValue = inputTags.get(config.output_tag_key) ?? null
        const changed = currentValue !== draftValue
        if (changed) {
          changedCount++
        }
        results.push({
          message_id: row.id,
          from: row.from_header,
          subject: row.subject,
          snippet: row.snippet,
          received_at: row.received_at,
          current_value: currentValue,
          draft_value: draftValue,
          changed,
        })
      }
    } catch (err) {
      // A malformed `match` expression throws at evaluation
      // (MatchExpressionError). `ruleBasedTaggerConfigSchema` validates
      // structure but `match` is a free string compiled at runtime, so this
      // is the editor's parse-error surface: fail the whole preview with the
      // expression error rather than silently dropping rows. The editor pane
      // shows it inline so the author fixes the rule before re-previewing.
      if (err instanceof MatchExpressionError) {
        return c.json({ error: 'invalid_match_expression', message: err.message }, 400)
      }
      throw err
    }

    return c.json<PreviewResponse>({
      results,
      changed_count: changedCount,
      total_evaluated: results.length,
    })
  })
}
