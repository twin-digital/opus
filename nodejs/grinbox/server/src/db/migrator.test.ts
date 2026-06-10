import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from './connection.js'
import { runMigrations } from './migrator.js'
import type { DB } from './schema.js'

/**
 * Acceptance test for the initial-schema migration (build-plan.md "First
 * check-in: Tier 0 green"): the migration applies to a fresh in-memory DB,
 * records itself, creates every table, and the representative CHECK constraints
 * and partial unique indexes actually enforce.
 */

const EXPECTED_TABLES = [
  'users',
  'accounts',
  'credentials',
  'pipelines',
  'operators',
  'operator_credential_references',
  'limits',
  'limit_counters_window',
  'limit_counters_message',
  'messages',
  'tags',
  'current_triages',
  'triages',
  'triage_operator_runs',
  'triage_events',
  'change_log',
]

describe('initial-schema migration', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('creates every expected table', async () => {
    const rows = await sql<{ name: string }>`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `.execute(db)
    const names = new Set(rows.rows.map((r) => r.name))
    for (const table of EXPECTED_TABLES) {
      expect(names.has(table), `table ${table} should exist`).toBe(true)
    }
  })

  it('records the migration in schema_migrations', async () => {
    const rows = await sql<{ name: string }>`
      SELECT name FROM schema_migrations
    `.execute(db)
    expect(rows.rows.map((r) => r.name)).toContain('20260601000000_initial_schema')
  })

  it('is idempotent across repeated runs (no pending migrations remain)', async () => {
    // Second run on the already-migrated DB must be a no-op, not an error.
    await expect(runMigrations(db)).resolves.toBeUndefined()
  })

  it('enforces the triages.status CHECK constraint', async () => {
    await seedUserMessagePipeline(db)
    await expect(
      db
        .insertInto('triages')
        .values({
          message_id: 1,
          pipeline_id: 1,
          triggered_by: 'message_arrival',
          actor_user_id: null,
          started_at: 1000,
          ended_at: null,
          status: 'bogus' as any,
          error_summary: null,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
  })

  it('enforces the accounts.poll_interval_seconds CHECK constraint', async () => {
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000, deleted_at: null }).execute()
    await expect(
      db
        .insertInto('accounts')
        .values({
          user_id: 1,
          name: 'a',
          provider_type: 'gmail',
          active_pipeline_id: null,
          settings_json: '{}',
          poll_interval_seconds: 10, // below the 60..86400 floor
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
  })

  it('partial unique index allows a soft-deleted name to be reused', async () => {
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000, deleted_at: null }).execute()

    const baseAccount = {
      user_id: 1,
      name: 'inbox',
      provider_type: 'gmail',
      active_pipeline_id: null,
      settings_json: '{}',
      created_at: 1000,
    }

    // First active account with this (user_id, name): fine.
    await db.insertInto('accounts').values(baseAccount).execute()

    // Second *active* account with the same (user_id, name): rejected.
    await expect(db.insertInto('accounts').values(baseAccount).execute()).rejects.toThrow(/UNIQUE constraint/i)

    // Soft-delete the first; the partial index (WHERE deleted_at IS NULL) no
    // longer covers it, so the name can be reused.
    await db.updateTable('accounts').set({ deleted_at: 2000 }).where('id', '=', 1).execute()

    await expect(db.insertInto('accounts').values(baseAccount).execute()).resolves.toBeDefined()
  })

  it('rejects a tags row whose (triage_id, operator_id) has no matching run', async () => {
    // Build a triage + ONE run for operator A, then try to write a tag claiming
    // operator B (no run row): the composite FK on tags → triage_operator_runs
    // must reject it. (A non-composite FK on triage_id alone would let it pass.)
    const { triageId, opA } = await seedTriageWithRun(db)
    await expect(
      db
        .insertInto('tags')
        .values({
          triage_id: triageId,
          operator_id: opA + 1000, // a different, run-less operator id
          key: 'urgency',
          value: 'high',
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint/i)
  })

  it('rejects a triage_events row whose (triage_id, operator_id) has no matching run', async () => {
    const { triageId, opA } = await seedTriageWithRun(db)
    await expect(
      db
        .insertInto('triage_events')
        .values({
          triage_id: triageId,
          operator_id: opA + 1000,
          sequence_num: 1,
          event_type: 'tag_set',
          details_json: null,
          recorded_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint/i)
  })

  it('account-scoped and user-scoped credential indexes are distinct (NULL-distinct trap)', async () => {
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000 }).execute()
    await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'a1',
        provider_type: 'gmail',
        settings_json: '{}',
        created_at: 1000,
      })
      .execute()
    await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'a2',
        provider_type: 'gmail',
        settings_json: '{}',
        created_at: 1000,
      })
      .execute()

    // User-scoped index: (user_id, kind) unique WHERE account_id IS NULL. Two
    // user-scoped pushover credentials collide.
    await db
      .insertInto('credentials')
      .values({
        user_id: 1,
        account_id: null,
        kind: 'pushover',
        data_enc: Buffer.from('x'),
        created_at: 1000,
      })
      .execute()
    await expect(
      db
        .insertInto('credentials')
        .values({
          user_id: 1,
          account_id: null,
          kind: 'pushover',
          data_enc: Buffer.from('y'),
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/UNIQUE constraint/i)

    // Account-scoped index: (user_id, kind, account_id) unique WHERE account_id
    // IS NOT NULL. Two account-scoped gmail credentials on the SAME account
    // collide; the NULL-distinct trap (a single index treating NULLs as
    // distinct) would let the user-scoped row above slip past, so these must be
    // two separate partial indexes.
    await db
      .insertInto('credentials')
      .values({
        user_id: 1,
        account_id: 1,
        kind: 'gmail_oauth',
        data_enc: Buffer.from('x'),
        created_at: 1000,
      })
      .execute()
    await expect(
      db
        .insertInto('credentials')
        .values({
          user_id: 1,
          account_id: 1,
          kind: 'gmail_oauth',
          data_enc: Buffer.from('y'),
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/UNIQUE constraint/i)

    // Same kind on a DIFFERENT account is allowed (the account_id participates).
    await expect(
      db
        .insertInto('credentials')
        .values({
          user_id: 1,
          account_id: 2,
          kind: 'gmail_oauth',
          data_enc: Buffer.from('z'),
          created_at: 1000,
        })
        .execute(),
    ).resolves.toBeDefined()
  })

  it('enforces the triages status/ended_at conditional CHECK', async () => {
    await seedUserMessagePipeline(db)
    // running + ended_at set → violates the conditional CHECK.
    await expect(
      db
        .insertInto('triages')
        .values({
          message_id: 1,
          pipeline_id: 1,
          triggered_by: 'message_arrival',
          actor_user_id: null,
          started_at: 1000,
          ended_at: 1000,
          status: 'running',
          error_summary: null,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
    // completed + ended_at NULL → also violates it.
    await expect(
      db
        .insertInto('triages')
        .values({
          message_id: 1,
          pipeline_id: 1,
          triggered_by: 'message_arrival',
          actor_user_id: null,
          started_at: 1000,
          ended_at: null,
          status: 'completed',
          error_summary: null,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
  })

  it('enforces the triage_operator_runs status/finished_at conditional CHECK', async () => {
    const { triageId, opA } = await seedTriageWithRun(db)
    // completed terminal status with finished_at NULL → violates the CHECK.
    await expect(
      db
        .insertInto('triage_operator_runs')
        .values({
          triage_id: triageId,
          operator_id: opA + 5000,
          message_id: 1,
          type_key: 'rule_based_tagger',
          type_code_version: '1',
          op_config_json: '{}',
          status: 'completed',
          finished_at: null,
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
  })

  it('enforces the limits scope/window_seconds conditional CHECK', async () => {
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000 }).execute()
    // per_window with NULL window_seconds → violates the CHECK.
    await expect(
      db
        .insertInto('limits')
        .values({
          user_id: 1,
          resource: 'gmail_api',
          operation: 'apply_label',
          scope: 'per_window',
          max_count: 10,
          window_seconds: null,
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
    // per_message with a non-NULL window_seconds → also violates it.
    await expect(
      db
        .insertInto('limits')
        .values({
          user_id: 1,
          resource: 'gmail_api',
          operation: 'apply_label',
          scope: 'per_message',
          max_count: 1,
          window_seconds: 600,
          created_at: 1000,
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/i)
  })
})

/**
 * Seed a user/account/pipeline/message/operator, a running triage, and ONE
 * pending run for that operator. Returns the triage id and the operator id that
 * has a run (`opA`); composite-FK tests pair `triageId` with a run-LESS
 * operator id to trip the constraint.
 */
async function seedTriageWithRun(db: DB): Promise<{ triageId: number; opA: number }> {
  await seedUserMessagePipeline(db)
  const op = await db
    .insertInto('operators')
    .values({
      pipeline_id: 1,
      name: 'opA',
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      config_json: '{}',
      enabled: 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const triage = await db
    .insertInto('triages')
    .values({
      message_id: 1,
      pipeline_id: 1,
      triggered_by: 'message_arrival',
      actor_user_id: null,
      started_at: 1000,
      ended_at: null,
      status: 'running',
      error_summary: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triage.id,
      operator_id: op.id,
      message_id: 1,
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: '{}',
      status: 'pending',
      created_at: 1000,
    })
    .execute()
  return { triageId: triage.id, opA: op.id }
}

/** Seed the minimal (user, message, pipeline) needed to insert a triage. */
async function seedUserMessagePipeline(db: DB): Promise<void> {
  await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000, deleted_at: null }).execute()
  await db.insertInto('pipelines').values({ user_id: 1, name: 'p', description: null, created_at: 1000 }).execute()
  await db
    .insertInto('accounts')
    .values({
      user_id: 1,
      name: 'a',
      provider_type: 'gmail',
      active_pipeline_id: null,
      settings_json: '{}',
      created_at: 1000,
    })
    .execute()
  await db
    .insertInto('messages')
    .values({
      account_id: 1,
      backend_message_id: 'm1',
      created_at: 1000,
    })
    .execute()
}
