import { type Kysely, sql } from 'kysely'
import { type MockedFunction, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../config.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { freshDb, seedBase } from '../pipeline/test-helpers.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import { type DigestScheduler, createDigestScheduler } from './digest-scheduler.js'
import { recoverInterruptedDigestRuns } from './recovery.js'

/**
 * Spec: d-wf49d4jb, d-svanshcm. Tests drive `runDueDigests(now)`
 * directly (never `start()`), with injected `now` values pinned to known UTC
 * instants — no real cron, no waiting.
 *
 * Covered claims:
 *  - eligibility: enabled + non-deleted digest Operators × non-deleted
 *    Accounts whose active Pipeline contains them; nothing else fires
 *  - due resolution: fires the latest elapsed occurrence once; nothing due →
 *    no row; catch-up after downtime fires at most once
 *  - the claim: an already-attempted occurrence (any status) never re-fires
 *  - watermark: covers_from chains from the last *completed* run's covers_to
 *    (operator created_at for the first run); a failed run's window is
 *    absorbed into the next occurrence ("covers the union")
 *  - config edits: an unparseable stored config is skipped
 *  - recovery: interrupted `running` rows sweep to `failed` and keep the
 *    watermark
 */

/** 2026-06-10T00:00:00Z. */
const JUN_10 = Date.UTC(2026, 5, 10) / 1000
const HOUR = 3600
const DAY = 86_400
/** Operator created Jun 8 00:00 — the first-run coverage floor. */
const CREATED_AT = JUN_10 - 2 * DAY

interface Fixture {
  db: Kysely<Database>
  categoryTaggerId: number
  accountId: number
  pipelineId: number
  operatorId: number
  invoke: ReturnType<typeof vi.fn>
  send: MockedFunction<() => Promise<{ message_id: string }>>
  scheduler: DigestScheduler
}

function digestConfigJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schedule: '0 20 * * *',
    sections: [{ category: 'release', title: 'Releases', render: 'count' }],
    summary_model_id: null,
    ...overrides,
  })
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
        output_value_enum: ['none', 'release'],
        rules: [],
        fallback: { output: 'none' },
      }),
      enabled: 1,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
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
      config_json: digestConfigJson(),
      enabled: 1,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const invoke = vi.fn(async () => ({
    text: 'digest body',
    usage: { inputTokens: 1, outputTokens: 1 },
    costUsdMicros: 1,
  }))
  const send = vi.fn(async () => ({ message_id: 'sent' }))
  const makeClients: MakeUnderlyingClients = () =>
    ({
      llm_bedrock: { invoke_model: invoke },
      mail_sender: { send_message: send },
      pushover_api: {},
    }) as unknown as UnderlyingClients

  const scheduler = createDigestScheduler({
    db,
    config: {
      digestSchedulerTickSeconds: 60,
      digestTimeoutMs: 5000,
    } as Config,
    makeClients,
  })
  return {
    db,
    categoryTaggerId: categoryTagger.id,
    accountId: base.accountId,
    pipelineId: base.pipelineId,
    operatorId: operator.id,
    invoke,
    send,
    scheduler,
  }
}

async function allRuns(db: Kysely<Database>) {
  return db.selectFrom('digest_runs').selectAll().orderBy('id', 'asc').execute()
}

/** A Message ingested at `createdAt` whose current Triage carries
 * `digest_category = 'release'` — a candidate for the fixture edition. */
async function seedCandidate(f: Fixture, backendId: string, createdAt: number): Promise<void> {
  const message = await f.db
    .insertInto('messages')
    .values({
      account_id: f.accountId,
      backend_message_id: backendId,
      created_at: createdAt,
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
      started_at: createdAt,
      ended_at: createdAt,
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
      started_at: createdAt,
      finished_at: createdAt,
      created_at: createdAt,
    })
    .execute()
  await f.db
    .insertInto('tags')
    .values({
      triage_id: triage.id,
      operator_id: f.categoryTaggerId,
      key: 'digest_category',
      value: 'release',
      created_at: createdAt,
    })
    .execute()
  await f.db
    .insertInto('current_triages')
    .values({
      message_id: message.id,
      pipeline_id: f.pipelineId,
      triage_id: triage.id,
      triage_started_at: createdAt,
      updated_at: createdAt,
    })
    .execute()
}

describe('digest scheduler', () => {
  let f: Fixture
  beforeEach(async () => {
    f = await fixture()
  })

  it('fires the elapsed occurrence once and records its coverage window', async () => {
    const now = JUN_10 + 21 * HOUR // 21:00, past the 20:00 fire
    const summaries = await f.scheduler.runDueDigests(now)

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      operatorId: f.operatorId,
      accountId: f.accountId,
      scheduledFor: JUN_10 + 20 * HOUR,
    })
    const runs = await allRuns(f.db)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      status: 'completed',
      scheduled_for: JUN_10 + 20 * HOUR,
      covers_from: CREATED_AT, // first run: from the Operator's creation
      covers_to: now,
      op_config_json: digestConfigJson(),
    })
  })

  it('does not fire again until the next occurrence elapses', async () => {
    await f.scheduler.runDueDigests(JUN_10 + 21 * HOUR)
    const again = await f.scheduler.runDueDigests(JUN_10 + 22 * HOUR)
    expect(again).toEqual([])
    expect(await allRuns(f.db)).toHaveLength(1)
  })

  it('fires nothing when no occurrence has elapsed yet', async () => {
    // A fresh Operator created at 09:00 today: no 20:00 occurrence has
    // elapsed since. (`created_at` is insert-only in the Kysely types, so the
    // rewind uses raw SQL.)
    await sql`UPDATE operators SET created_at = ${JUN_10 + 9 * HOUR} WHERE id = ${f.operatorId}`.execute(f.db)
    const summaries = await f.scheduler.runDueDigests(JUN_10 + 10 * HOUR)
    expect(summaries).toEqual([])
    expect(await allRuns(f.db)).toEqual([])
  })

  it('catch-up after downtime fires at most once, covering the whole gap', async () => {
    // First fire on Jun 8 21:00.
    await f.scheduler.runDueDigests(JUN_10 - 2 * DAY + 21 * HOUR)
    // Daemon "down" over Jun 9's and Jun 10's 20:00 fires; back Jun 11 09:00.
    const back = JUN_10 + DAY + 9 * HOUR
    const summaries = await f.scheduler.runDueDigests(back)

    expect(summaries).toHaveLength(1)
    // Only the latest missed occurrence (Jun 10 20:00) fires — Jun 9's never.
    expect(summaries[0]?.scheduledFor).toBe(JUN_10 + 20 * HOUR)
    const runs = await allRuns(f.db)
    expect(runs).toHaveLength(2)
    // Its window chains from the previous completed run — the gap is covered.
    expect(runs[1]).toMatchObject({
      covers_from: JUN_10 - 2 * DAY + 21 * HOUR,
      covers_to: back,
    })
  })

  it('a failed run keeps the watermark; the next occurrence covers the union', async () => {
    const firstNow = JUN_10 + 21 * HOUR
    await seedCandidate(f, 'in-first-window', JUN_10 + HOUR)
    // A failing send fails the run (an undelivered digest is a failure).
    f.send.mockRejectedValue(new Error('send down'))
    const first = await f.scheduler.runDueDigests(firstNow)
    expect(first[0]?.outcome.status).toBe('failed')
    f.send.mockImplementation(async () => ({ message_id: 'sent' }))

    // Next day's occurrence: the window starts back at the Operator's
    // creation (no completed run yet), so the failed window is re-covered.
    await seedCandidate(f, 'in-second-window', JUN_10 + DAY)
    const secondNow = JUN_10 + DAY + 21 * HOUR
    const second = await f.scheduler.runDueDigests(secondNow)
    expect(second[0]?.outcome.status).toBe('completed')
    // Both windows' candidates are covered (the seed fixture's base Message
    // predates the Operator's creation and stays outside).
    expect(second[0]?.outcome.messageCount).toBe(2)

    const runs = await allRuns(f.db)
    expect(runs[1]).toMatchObject({
      covers_from: CREATED_AT,
      covers_to: secondNow,
    })
  })

  it('an already-claimed occurrence is never fired twice (INSERT claim)', async () => {
    const now = JUN_10 + 21 * HOUR
    // Simulate a racing tick's claim landing first: same occurrence, running.
    await f.db
      .insertInto('digest_runs')
      .values({
        operator_id: f.operatorId,
        account_id: f.accountId,
        scheduled_for: JUN_10 + 20 * HOUR,
        covers_from: CREATED_AT,
        covers_to: now,
        op_config_json: digestConfigJson(),
        status: 'running',
        started_at: now,
        finished_at: null,
        message_count: null,
        error_summary: null,
        resource_usage_json: null,
        events_json: null,
      })
      .execute()

    const summaries = await f.scheduler.runDueDigests(now)
    expect(summaries).toEqual([])
    expect(f.send).not.toHaveBeenCalled()
    expect(await allRuns(f.db)).toHaveLength(1)
  })

  it('overlapping cycles are guarded: a second call during flight is a no-op', async () => {
    await seedCandidate(f, 'c1', JUN_10 + HOUR)
    let release: () => void = () => {}
    let parked = false
    const hasParked = (): boolean => parked
    // Park the cycle inside its send so a second tick arrives mid-flight.
    f.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          parked = true
          release = () => {
            resolve({ message_id: 'sent' })
          }
        }),
    )
    const now = JUN_10 + 21 * HOUR
    const first = f.scheduler.runDueDigests(now)
    // Let the cycle actually reach the parked send before the second tick.
    while (!hasParked()) {
      await new Promise((r) => setImmediate(r))
    }
    const second = await f.scheduler.runDueDigests(now)
    expect(second).toEqual([])
    release()
    const summaries = await first
    expect(summaries).toHaveLength(1)
  })

  it('skips disabled and soft-deleted Operators and deleted Accounts', async () => {
    const now = JUN_10 + 21 * HOUR
    await f.db.updateTable('operators').set({ enabled: 0 }).where('id', '=', f.operatorId).execute()
    expect(await f.scheduler.runDueDigests(now)).toEqual([])

    await f.db.updateTable('operators').set({ enabled: 1, deleted_at: now }).where('id', '=', f.operatorId).execute()
    expect(await f.scheduler.runDueDigests(now)).toEqual([])

    await f.db.updateTable('operators').set({ deleted_at: null }).where('id', '=', f.operatorId).execute()
    await f.db.updateTable('accounts').set({ deleted_at: now }).where('id', '=', f.accountId).execute()
    expect(await f.scheduler.runDueDigests(now)).toEqual([])
    expect(await allRuns(f.db)).toEqual([])
  })

  it('skips an Account whose active Pipeline is not the Operator’s', async () => {
    await f.db.updateTable('accounts').set({ active_pipeline_id: null }).where('id', '=', f.accountId).execute()
    expect(await f.scheduler.runDueDigests(JUN_10 + 21 * HOUR)).toEqual([])
  })

  it('skips an Operator whose stored config no longer parses', async () => {
    await f.db
      .updateTable('operators')
      .set({ config_json: '{"schedule": ""}' })
      .where('id', '=', f.operatorId)
      .execute()
    expect(await f.scheduler.runDueDigests(JUN_10 + 21 * HOUR)).toEqual([])
    expect(await allRuns(f.db)).toEqual([])
  })

  it('skips a croner-rejected schedule/timezone with a warning, claiming nothing', async () => {
    await f.db
      .updateTable('operators')
      .set({ config_json: digestConfigJson({ timezone: 'Mars/Olympus' }) })
      .where('id', '=', f.operatorId)
      .execute()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await f.scheduler.runDueDigests(JUN_10 + 21 * HOUR)).toEqual([])
      expect(await allRuns(f.db)).toEqual([])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected by croner'))
    } finally {
      warn.mockRestore()
    }
  })

  it('evaluates the schedule in the configured timezone', async () => {
    await f.db
      .updateTable('operators')
      .set({
        config_json: digestConfigJson({ timezone: 'Asia/Tokyo' }),
      })
      .where('id', '=', f.operatorId)
      .execute()
    // 20:00 Asia/Tokyo (UTC+9) = 11:00Z the same day. At Jun 10 11:30Z the
    // most recent elapsed occurrence is Jun 10 11:00Z — not 20:00Z-based.
    const summaries = await f.scheduler.runDueDigests(JUN_10 + 11 * HOUR + 1800)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.scheduledFor).toBe(JUN_10 + 11 * HOUR)
  })
})

describe('recoverInterruptedDigestRuns', () => {
  it('marks running rows failed; the occurrence stays claimed and the watermark stays', async () => {
    const f = await fixture()
    const now = JUN_10 + 21 * HOUR
    await f.db
      .insertInto('digest_runs')
      .values({
        operator_id: f.operatorId,
        account_id: f.accountId,
        scheduled_for: JUN_10 + 20 * HOUR,
        covers_from: CREATED_AT,
        covers_to: now,
        op_config_json: digestConfigJson(),
        status: 'running',
        started_at: now,
        finished_at: null,
        message_count: null,
        error_summary: null,
        resource_usage_json: null,
        events_json: null,
      })
      .execute()

    expect(await recoverInterruptedDigestRuns(f.db)).toBe(1)
    const runs = await allRuns(f.db)
    expect(runs[0]).toMatchObject({
      status: 'failed',
      error_summary: 'daemon interrupted',
    })
    expect(runs[0]?.finished_at).not.toBeNull()

    // Idempotent; and the swept occurrence never re-fires...
    expect(await recoverInterruptedDigestRuns(f.db)).toBe(0)
    expect(await f.scheduler.runDueDigests(now)).toEqual([])
    // ...while the NEXT occurrence's window covers the swept one's gap.
    const next = await f.scheduler.runDueDigests(JUN_10 + DAY + 21 * HOUR)
    expect(next).toHaveLength(1)
    expect((await allRuns(f.db))[1]).toMatchObject({ covers_from: CREATED_AT })
  })
})
