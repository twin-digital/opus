import type { DigestDeliveryConfig } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { freshDb, seedBase } from '../pipeline/test-helpers.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import {
  type DigestRunClaim,
  type DigestWindow,
  MAX_DIGEST_CANDIDATES,
  digestFooter,
  digestSubject,
  executeDigestRun,
} from './digest-runner.js'

/**
 * Spec: docs/digest-design.md "Digest-time: deterministic collation" + the
 * digest-runner module header. Composition is deterministic — given a window
 * of Messages and Tags, the digest body is exactly reproducible — so these
 * tests assert **full expected output**. Transports are fakes behind the real
 * metered-client factory, so Limit enforcement, metering, and event
 * accumulation run for real against the in-memory DB (seeded default Limits).
 *
 * Coverage: section shapes (list/table/count) with exact bodies; template
 * fallback lines; typed highlight; footer (unclaimed categories, sibling
 * claims, fallback exclusion, truncation); prose blocks (text verbatim, llm
 * inserted, llm failure omitted without failing the run); empty window; send
 * failure/denial; per_message non-applicability; missing owner address.
 */

interface Fixture {
  db: Kysely<Database>
  userId: number
  pipelineId: number
  accountId: number
  operatorId: number
  /** The rule tagger producing digest_category (enum + fallback for footers). */
  categoryTaggerId: number
  invoke: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  makeClients: MakeUnderlyingClients
}

const NOW = 1_750_000_000

/** The category enum the fixture's producer declares; 'none' is the fallback. */
const CATEGORY_ENUM = ['none', 'bill', 'receipt', 'release', 'deal']

function digestConfig(overrides: Partial<DigestDeliveryConfig> = {}): DigestDeliveryConfig {
  return {
    schedule: '0 20 * * *',
    sections: [
      {
        category: 'bill',
        title: 'Bills & statements',
        render: 'list',
        item_template: '{{tag.payee}} — {{tag.amount}} due {{tag.due_date}}',
      },
      {
        category: 'receipt',
        title: 'Receipts',
        render: 'table',
        columns: [
          { header: 'From', template: '{{from}}' },
          { header: 'Amount', template: '{{tag.amount}}' },
        ],
        highlight: { tag_key: 'amount', over: '10000:USD' },
      },
      { category: 'release', title: 'Releases', render: 'count' },
    ],
    summary_model_id: null,
    ...overrides,
  }
}

async function fixture(): Promise<Fixture> {
  const db = await freshDb()
  const base = await seedBase(db)
  await seedDefaultLimits(db, base.userId)
  await db
    .updateTable('accounts')
    .set({ settings_json: JSON.stringify({ email: 'owner@example.com' }) })
    .where('id', '=', base.accountId)
    .execute()

  const categoryTagger = await db
    .insertInto('operators')
    .values({
      pipeline_id: base.pipelineId,
      name: 'category',
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      config_json: JSON.stringify({
        output_tag_key: 'digest_category',
        output_value_enum: CATEGORY_ENUM,
        rules: [],
        fallback: { output: 'none' },
      }),
      enabled: 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const operator = await db
    .insertInto('operators')
    .values({
      pipeline_id: base.pipelineId,
      name: 'Daily digest',
      type_key: 'digest_delivery',
      type_code_version: '1',
      config_json: JSON.stringify(digestConfig()),
      enabled: 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const invoke = vi.fn(async () => ({
    text: 'LLM PROSE',
    usage: { inputTokens: 10, outputTokens: 5 },
    costUsdMicros: 42,
  }))
  const send = vi.fn(async () => ({ message_id: 'sent-1' }))
  const makeClients: MakeUnderlyingClients = () =>
    ({
      llm_bedrock: { invoke_model: invoke },
      mail_sender: { send_message: send },
      pushover_api: {},
    }) as unknown as UnderlyingClients

  return {
    db,
    userId: base.userId,
    pipelineId: base.pipelineId,
    accountId: base.accountId,
    operatorId: operator.id,
    categoryTaggerId: categoryTagger.id,
    invoke,
    send,
    makeClients,
  }
}

/** Insert the claimed `digest_runs` row + return the runner's claim view. */
async function claimRun(
  f: Fixture,
  window: { from: number; to: number },
  config: DigestDeliveryConfig = digestConfig(),
): Promise<DigestRunClaim> {
  const row = await f.db
    .insertInto('digest_runs')
    .values({
      operator_id: f.operatorId,
      account_id: f.accountId,
      scheduled_for: window.to,
      covers_from: window.from,
      covers_to: window.to,
      op_config_json: JSON.stringify(config),
      status: 'running',
      started_at: window.to,
      finished_at: null,
      message_count: null,
      error_summary: null,
      resource_usage_json: null,
      events_json: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return {
    runId: row.id,
    operatorId: f.operatorId,
    operatorName: 'Daily digest',
    accountId: f.accountId,
    pipelineId: f.pipelineId,
    userId: f.userId,
    config,
    coversFrom: window.from,
    coversTo: window.to,
  }
}

/**
 * Insert a Message in the window with a settled Triage carrying
 * `digest_category` = `category` plus any extra Tags (the extraction fields
 * the section templates read).
 */
async function seedCandidate(
  f: Fixture,
  args: {
    backendId: string
    createdAt: number
    category: string
    from?: string | null
    subject?: string | null
    tags?: Record<string, string>
  },
): Promise<void> {
  const message = await f.db
    .insertInto('messages')
    .values({
      account_id: f.accountId,
      backend_message_id: args.backendId,
      subject: args.subject === undefined ? `subject ${args.backendId}` : args.subject,
      from_header: args.from === undefined ? `Sender <${args.backendId}@example.com>` : args.from,
      snippet: 'snippet',
      received_at: args.createdAt,
      created_at: args.createdAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const triage = await f.db
    .insertInto('triages')
    .values({
      message_id: message.id,
      pipeline_id: f.pipelineId,
      triggered_by: 'message_arrival',
      actor_user_id: null,
      started_at: args.createdAt,
      ended_at: args.createdAt,
      status: 'completed',
      error_summary: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await f.db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triage.id,
      operator_id: f.categoryTaggerId,
      message_id: message.id,
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: '{}',
      status: 'completed',
      started_at: args.createdAt,
      finished_at: args.createdAt,
      created_at: args.createdAt,
    })
    .execute()
  const allTags = { digest_category: args.category, ...(args.tags ?? {}) }
  for (const [key, value] of Object.entries(allTags)) {
    await f.db
      .insertInto('tags')
      .values({
        triage_id: triage.id,
        operator_id: f.categoryTaggerId,
        key,
        value,
        created_at: args.createdAt,
      })
      .execute()
  }
  await f.db
    .insertInto('current_triages')
    .values({
      message_id: message.id,
      pipeline_id: f.pipelineId,
      triage_id: triage.id,
      triage_started_at: args.createdAt,
      updated_at: args.createdAt,
    })
    .execute()
}

/**
 * A Message in the window whose Triage produced no `digest_category` Tag — the
 * category producer failed, or the Pipeline carried none when it ran. The
 * message is still inside the coverage window (d-jsnfvo0m), so the digest owes
 * an accounting for it (r-vd9mu8od).
 */
async function seedUncategorized(f: Fixture, args: { backendId: string; createdAt: number }): Promise<void> {
  const message = await f.db
    .insertInto('messages')
    .values({
      account_id: f.accountId,
      backend_message_id: args.backendId,
      subject: `subject ${args.backendId}`,
      from_header: `Sender <${args.backendId}@example.com>`,
      snippet: 'snippet',
      received_at: args.createdAt,
      created_at: args.createdAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const triage = await f.db
    .insertInto('triages')
    .values({
      message_id: message.id,
      pipeline_id: f.pipelineId,
      triggered_by: 'message_arrival',
      actor_user_id: null,
      started_at: args.createdAt,
      ended_at: args.createdAt,
      status: 'partial',
      error_summary: 'category tagger failed',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await f.db
    .insertInto('current_triages')
    .values({
      message_id: message.id,
      pipeline_id: f.pipelineId,
      triage_id: triage.id,
      triage_started_at: args.createdAt,
      updated_at: args.createdAt,
    })
    .execute()
}

async function runRow(f: Fixture, runId: number) {
  return f.db.selectFrom('digest_runs').selectAll().where('id', '=', runId).executeTakeFirstOrThrow()
}

function sentBody(f: Fixture): string {
  return (f.send.mock.calls[0]?.[0] as { body: string }).body
}

describe('executeDigestRun — deterministic composition', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await fixture()
  })

  it('renders list/table/count sections into the exact expected body', async () => {
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 300,
      category: 'bill',
      tags: { payee: 'Water Co', amount: '4200:USD', due_date: '2026-08-10' },
    })
    await seedCandidate(f, {
      backendId: 'r1',
      createdAt: NOW - 200,
      category: 'receipt',
      from: 'Shop A <a@shop.example>',
      tags: { amount: '4900:USD' },
    })
    await seedCandidate(f, {
      backendId: 'r2',
      createdAt: NOW - 100,
      category: 'receipt',
      from: 'Shop B <b@shop.example>',
      tags: { amount: '19503:USD' }, // over the 10000:USD highlight threshold
    })
    await seedCandidate(f, {
      backendId: 'rel1',
      createdAt: NOW - 50,
      category: 'release',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome).toEqual({
      status: 'completed',
      messageCount: 4,
      errorSummary: null,
    })
    expect(f.invoke).not.toHaveBeenCalled() // zero model calls without prose
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }), expect.anything())
    expect(sentBody(f)).toBe(
      [
        '## Bills & statements',
        '',
        '- Water Co — 4200:USD due 2026-08-10',
        '',
        '## Receipts',
        '',
        '| From | Amount |',
        '| --- | --- |',
        '| Shop A <a@shop.example> | 4900:USD |',
        '| Shop B <b@shop.example> | 19503:USD (!) |',
        '',
        '## Releases',
        '',
        '1 message',
      ].join('\n'),
    )
    const row = await runRow(f, claim.runId)
    expect(row.status).toBe('completed')
    expect(row.message_count).toBe(4)
    const usage = JSON.parse(row.resource_usage_json ?? '{}')
    expect(usage['mail_sender.send_message']).toMatchObject({
      calls: 1,
      succeeded: 1,
    })
  })

  it('a Message whose rendering is entirely empty falls back to from + subject', async () => {
    // Pure-placeholder templates: with the Tags absent, the rendering is
    // entirely empty (a template with literal text never is), so the
    // fallback line fires.
    const config = digestConfig({
      sections: [
        {
          category: 'bill',
          title: 'Bills & statements',
          render: 'list',
          item_template: '{{tag.payee}}{{tag.amount}}',
        },
        {
          category: 'receipt',
          title: 'Receipts',
          render: 'table',
          columns: [
            { header: 'Payee', template: '{{tag.payee}}' },
            { header: 'Amount', template: '{{tag.amount}}' },
          ],
        },
      ],
    })
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 100,
      category: 'bill',
      from: 'Utility <u@example.com>',
      subject: 'Your statement',
      tags: {}, // no payee/amount → item renders empty → fallback
    })
    await seedCandidate(f, {
      backendId: 'r1',
      createdAt: NOW - 90,
      category: 'receipt',
      from: null,
      subject: null,
      tags: {}, // ALL cells empty → fallback in the first column
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW }, config)

    await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(sentBody(f)).toBe(
      [
        '## Bills & statements',
        '',
        '- Utility <u@example.com> — Your statement',
        '',
        '## Receipts',
        '',
        '| Payee | Amount |',
        '| --- | --- |',
        '| (message r1) |  |',
      ].join('\n'),
    )
  })

  it('counts unclaimed non-fallback categories in the footer; fallback stays silent', async () => {
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 100,
      category: 'bill',
      tags: { payee: 'P', amount: '100:USD', due_date: '2026-01-01' },
    })
    // 'deal' is in the producer enum but no edition claims it → footer.
    await seedCandidate(f, {
      backendId: 'd1',
      createdAt: NOW - 90,
      category: 'deal',
    })
    await seedCandidate(f, {
      backendId: 'd2',
      createdAt: NOW - 80,
      category: 'deal',
    })
    // 'none' is the producer fallback ("never digested") → NOT in the footer.
    await seedCandidate(f, {
      backendId: 'n1',
      createdAt: NOW - 70,
      category: 'none',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.messageCount).toBe(1) // only the claimed candidate
    expect(sentBody(f)).toBe(
      [
        '## Bills & statements',
        '',
        '- P — 100:USD due 2026-01-01',
        '',
        '—',
        'Also in this window: 2 messages in categories with no section: deal (2)',
      ].join('\n'),
    )
  })

  it('a category claimed by a sibling edition stays out of the footer', async () => {
    // A second enabled edition claims 'deal'.
    await f.db
      .insertInto('operators')
      .values({
        pipeline_id: f.pipelineId,
        name: 'Weekly digest',
        type_key: 'digest_delivery',
        type_code_version: '1',
        config_json: JSON.stringify(
          digestConfig({
            sections: [{ category: 'deal', title: 'Deals', render: 'count' }],
          }),
        ),
        enabled: 1,
        created_at: 1000,
        updated_at: 1000,
      })
      .execute()
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 100,
      category: 'bill',
      tags: { payee: 'P', amount: '1:USD', due_date: '2026-01-01' },
    })
    await seedCandidate(f, {
      backendId: 'd1',
      createdAt: NOW - 90,
      category: 'deal',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(sentBody(f)).not.toContain('deal')
    expect(sentBody(f)).not.toContain('Also in this window')
  })

  it('inserts text prose verbatim and llm prose from the metered model call', async () => {
    const config = digestConfig({
      summary_model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      sections: [
        {
          category: 'bill',
          title: 'Bills & statements',
          render: 'list',
          item_template: '{{tag.payee}}',
          before: { kind: 'llm', prompt: 'One-sentence overview.' },
          after: { kind: 'text', text: 'Pay on time.' },
        },
      ],
    })
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 100,
      category: 'bill',
      tags: { payee: 'Water Co' },
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW }, config)

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('completed')
    // The llm prose call carried the section's rendered items as context.
    const prompt = (f.invoke.mock.calls[0]?.[0] as { prompt: string }).prompt
    expect(prompt).toContain('One-sentence overview.')
    expect(prompt).toContain('- Water Co')
    expect(sentBody(f)).toBe(
      ['## Bills & statements', '', 'LLM PROSE', '', '- Water Co', '', 'Pay on time.'].join('\n'),
    )
  })

  it('a failed llm prose block is omitted; items and the run are untouched', async () => {
    f.invoke.mockRejectedValue(new Error('bedrock down'))
    const config = digestConfig({
      summary_model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      sections: [
        {
          category: 'bill',
          title: 'Bills & statements',
          render: 'list',
          item_template: '{{tag.payee}}',
          before: { kind: 'llm', prompt: 'Overview.' },
        },
      ],
    })
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 100,
      category: 'bill',
      tags: { payee: 'Water Co' },
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW }, config)

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('completed')
    expect(sentBody(f)).toBe(['## Bills & statements', '', '- Water Co'].join('\n'))
    // The metered failure is still evented for the Activity feed.
    const row = await runRow(f, claim.runId)
    const events = JSON.parse(row.events_json ?? '[]') as {
      event_type: string
    }[]
    expect(events.some((e) => e.event_type === 'resource_op_failed')).toBe(true)
  })

  it('excludes messages outside the coverage window and omits empty sections', async () => {
    await seedCandidate(f, {
      backendId: 'in',
      createdAt: NOW - 10,
      category: 'release',
    })
    await seedCandidate(f, {
      backendId: 'before',
      createdAt: NOW - 5000,
      category: 'release',
    })
    await seedCandidate(f, {
      backendId: 'after',
      createdAt: NOW + 10,
      category: 'release',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.messageCount).toBe(1)
    // Bills/Receipts have no candidates → omitted entirely.
    expect(sentBody(f)).toBe(['## Releases', '', '1 message'].join('\n'))
  })

  it('completes an empty window without sending', async () => {
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome).toEqual({
      status: 'completed',
      messageCount: 0,
      errorSummary: null,
    })
    expect(f.send).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
    const row = await runRow(f, claim.runId)
    expect(row.status).toBe('completed')
    expect(row.message_count).toBe(0)
  })

  it('fails the run when the send fails', async () => {
    f.send.mockRejectedValue(new Error('smtp-ish sadness'))
    await seedCandidate(f, {
      backendId: 'rel1',
      createdAt: NOW - 100,
      category: 'release',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorSummary).toContain('smtp-ish sadness')
    expect((await runRow(f, claim.runId)).status).toBe('failed')
  })

  it('fails the run when a per_window send Limit denies (digest not delivered)', async () => {
    await seedCandidate(f, {
      backendId: 'rel1',
      createdAt: NOW - 100,
      category: 'release',
    })
    const limit = await f.db
      .selectFrom('limits')
      .select(['id', 'max_count'])
      .where('resource', '=', 'mail_sender')
      .where('operation', '=', 'send_message')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    await f.db
      .insertInto('limit_counters_window')
      .values({
        limit_id: limit.id,
        window_start: Math.floor(Date.now() / 1000),
        count: limit.max_count,
      })
      .execute()
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorSummary).toContain('denied by limit')
    expect(f.send).not.toHaveBeenCalled()
    const events = JSON.parse((await runRow(f, claim.runId)).events_json ?? '[]') as { event_type: string }[]
    expect(events.some((e) => e.event_type === 'resource_op_limited')).toBe(true)
  })

  it('the seeded per_message send Limit does not bind a scheduled send', async () => {
    await seedCandidate(f, {
      backendId: 'rel1',
      createdAt: NOW - 100,
      category: 'release',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('completed')
    const counters = await f.db.selectFrom('limit_counters_message').selectAll().execute()
    expect(counters).toEqual([])
  })

  it('fails the run when the account has no owner address', async () => {
    await f.db.updateTable('accounts').set({ settings_json: '{}' }).where('id', '=', f.accountId).execute()
    await seedCandidate(f, {
      backendId: 'rel1',
      createdAt: NOW - 100,
      category: 'release',
    })
    const claim = await claimRun(f, { from: NOW - 1000, to: NOW })

    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('failed')
    expect(outcome.errorSummary).toContain('no owner address')
    expect(f.send).not.toHaveBeenCalled()
  })
})

describe('digestFooter', () => {
  const window = (overrides: Partial<DigestWindow>): DigestWindow => ({
    candidates: [],
    categoryCounts: new Map(),
    claimedCategories: new Set(),
    fallbackCategory: null,
    truncatedOverflow: 0,
    ...overrides,
  })

  it('reports unclaimed categories sorted, excluding claims and the fallback', () => {
    expect(
      digestFooter(
        window({
          categoryCounts: new Map([
            ['deal', 2],
            ['bill', 3],
            ['outreach', 1],
            ['none', 9],
          ]),
          claimedCategories: new Set(['bill']),
          fallbackCategory: 'none',
        }),
      ),
    ).toBe('Also in this window: 3 messages in categories with no section: deal (2), outreach (1)')
  })

  it('reports truncation overflow beyond the candidate cap', () => {
    expect(digestFooter(window({ truncatedOverflow: 7 }))).toBe(
      `7 more messages beyond the ${MAX_DIGEST_CANDIDATES}-item cap not shown`,
    )
  })

  it('is null when there is nothing to report', () => {
    expect(digestFooter(window({}))).toBeNull()
  })
})

describe('digestSubject', () => {
  it('renders the operator name and the coverage end date in the configured zone', () => {
    // 2026-06-09T16:00:00Z is already 2026-06-10 in Tokyo (UTC+9).
    const coversTo = Date.UTC(2026, 5, 9, 16) / 1000
    expect(
      digestSubject({
        operatorName: 'Daily digest',
        coversTo,
        config: { timezone: 'Asia/Tokyo' },
      }),
    ).toBe('Daily digest — 2026-06-10')
  })
})

describe('executeDigestRun — the accounting covers the whole window', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await fixture()
  })

  // The reconciliation assertion compares two numbers drawn from the same
  // tag-joined selection, so an untagged Message is invisible to both sides of
  // it. The delivery completes, the watermark advances (d-jbqvsnox), and the
  // mail is never digested by anything — which r-vd9mu8od forbids.
  it.skip('reports a Message the window covers that carries no category', async () => {
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 300,
      category: 'bill',
      tags: { payee: 'Water Co', amount: '4200:USD', due_date: '2026-08-10' },
    })
    await seedUncategorized(f, { backendId: 'u1', createdAt: NOW - 200 })

    const claim = await claimRun(f, { from: NOW - 86_400, to: NOW })
    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('completed')
    // Shown items plus reported counts are the whole of the window: the one
    // uncategorized message is counted and attributed.
    expect(sentBody(f)).toContain('1')
    expect(sentBody(f).toLowerCase()).toMatch(/uncategor|no category|not categorized/)
  })

  // The same message with no Triage at all under the Pipeline — the window
  // closed before triage settled. Still the account's mail in the window.
  it.skip('reports a Message the window covers that has no triage', async () => {
    await seedCandidate(f, {
      backendId: 'b1',
      createdAt: NOW - 300,
      category: 'bill',
      tags: { payee: 'Water Co', amount: '4200:USD', due_date: '2026-08-10' },
    })
    await f.db
      .insertInto('messages')
      .values({
        account_id: f.accountId,
        backend_message_id: 'n1',
        subject: 'untriaged',
        from_header: 'Sender <n1@example.com>',
        snippet: 'snippet',
        received_at: NOW - 150,
        created_at: NOW - 150,
      })
      .execute()

    const claim = await claimRun(f, { from: NOW - 86_400, to: NOW })
    const outcome = await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(outcome.status).toBe('completed')
    expect(sentBody(f).toLowerCase()).toMatch(/uncategor|no category|not categorized|untriaged/)
  })

  // A window holding nothing but uncategorized mail still owes the accounting:
  // the "empty window sends nothing" path (d-dmylyoqs) keys on the candidate
  // count, which the untagged mail never reaches.
  it.skip('does not treat a window of uncategorized mail as empty', async () => {
    await seedUncategorized(f, { backendId: 'u1', createdAt: NOW - 200 })

    const claim = await claimRun(f, { from: NOW - 86_400, to: NOW })
    await executeDigestRun({ db: f.db, makeClients: f.makeClients, timeoutMs: 5000 }, claim)

    expect(f.send).toHaveBeenCalled()
  })
})
