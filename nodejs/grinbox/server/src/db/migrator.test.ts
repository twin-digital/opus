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
          // biome-ignore lint/suspicious/noExplicitAny: deliberately bad value to trip the CHECK
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
          resource: 'mailbox',
          operation: 'apply_category',
          scope: 'per_window',
          origin: 'user' as const,
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
          resource: 'mailbox',
          operation: 'apply_category',
          scope: 'per_message',
          origin: 'user' as const,
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

describe('mail-resources migration (limits rewrite)', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('rewrites gmail_api limits to mailbox/mail_sender, preserving counters', async () => {
    const { up } = await import('../migrations/20260604000000_mail_resources.js')
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000 }).execute()
    // Rows as a pre-rename deployment stored them (the resource/operation
    // columns are open TEXT, so the old names insert cleanly post-migration).
    const oldRows: {
      operation: string
      scope: 'per_window' | 'per_message'
      window: number | null
    }[] = [
      { operation: 'apply_label', scope: 'per_window', window: 600 },
      { operation: 'archive', scope: 'per_window', window: 600 },
      { operation: 'fetch_body', scope: 'per_window', window: 600 },
      { operation: 'send_message', scope: 'per_window', window: 86400 },
      { operation: 'send_message', scope: 'per_message', window: null },
    ]
    for (const row of oldRows) {
      await db
        .insertInto('limits')
        .values({
          user_id: 1,
          resource: 'gmail_api',
          operation: row.operation,
          scope: row.scope,
          origin: 'seeded' as const,
          max_count: 5,
          window_seconds: row.window,
          created_at: 1000,
        })
        .execute()
    }
    // A live window counter attached to the apply_label limit: the rewrite
    // must leave it keyed to the same limit_id (enforcement keeps counting).
    const applyLimit = await db
      .selectFrom('limits')
      .select('id')
      .where('operation', '=', 'apply_label')
      .executeTakeFirstOrThrow()
    await db
      .insertInto('limit_counters_window')
      .values({ limit_id: applyLimit.id, window_start: 900, count: 3 })
      .execute()

    await up(db as unknown as Parameters<typeof up>[0])

    const rows = await db
      .selectFrom('limits')
      .select(['id', 'resource', 'operation', 'scope'])
      .orderBy('id', 'asc')
      .execute()
    expect(rows.map((r) => `${r.resource}.${r.operation} (${r.scope})`)).toEqual([
      'mailbox.apply_category (per_window)',
      'mailbox.archive (per_window)',
      'mailbox.fetch_body (per_window)',
      'mail_sender.send_message (per_window)',
      'mail_sender.send_message (per_message)',
    ])
    const counter = await db.selectFrom('limit_counters_window').select(['limit_id', 'count']).executeTakeFirstOrThrow()
    expect(counter).toEqual({ limit_id: applyLimit.id, count: 3 })
  })
})

describe('limit-origin migration (provenance backfill)', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
    // Rebuild `limits` in its pre-migration shape so the rebuild and the
    // backfill run against what a deployed state actually held: no `origin`
    // column, and uniqueness on `(user_id, resource, operation, scope)`.
    await sql`DROP TABLE limits`.execute(db)
    await sql`
      CREATE TABLE limits (
        id              INTEGER PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        resource        TEXT    NOT NULL,
        operation       TEXT    NOT NULL,
        scope           TEXT    NOT NULL CHECK (scope IN ('per_window', 'per_message')),
        max_count       INTEGER NOT NULL CHECK (max_count > 0),
        window_seconds  INTEGER,
        created_at      INTEGER NOT NULL,
        UNIQUE (user_id, resource, operation, scope),
        CHECK ((scope = 'per_window' AND window_seconds IS NOT NULL AND window_seconds > 0)
            OR (scope = 'per_message' AND window_seconds IS NULL))
      )
    `.execute(db)
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 1000 }).execute()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  /** Insert a pre-migration row (no `origin` column exists yet). */
  async function oldLimit(resource: string, operation: string, scope: string, maxCount: number): Promise<void> {
    await sql`
      INSERT INTO limits (user_id, resource, operation, scope, max_count, window_seconds, created_at)
      VALUES (1, ${resource}, ${operation}, ${scope}, ${maxCount}, ${scope === 'per_window' ? 600 : null}, 1000)
    `.execute(db)
  }

  it("labels a row matching grinbox's seeded set as seeded, and anything else as the user's", async () => {
    await oldLimit('pushover_api', 'send_notification', 'per_window', 10)
    await oldLimit('llm_bedrock', 'invoke_model', 'per_message', 4)

    const { up } = await import('../migrations/20260605000000_limit_origin.js')
    await up(db as unknown as Parameters<typeof up>[0])

    const rows = await db
      .selectFrom('limits')
      .select(['resource', 'operation', 'scope', 'origin', 'max_count'])
      .orderBy('resource', 'asc')
      .execute()
    expect(rows).toEqual([
      {
        resource: 'llm_bedrock',
        operation: 'invoke_model',
        scope: 'per_message',
        // Not in the seeded set at this migration, so it is the user's and stays
        // removable; the seeded per_window cap is reinserted by the next boot.
        origin: 'user',
        max_count: 4,
      },
      {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_window',
        origin: 'seeded',
        max_count: 10,
      },
    ])
  })

  it('preserves ids so the counter rows keep counting', async () => {
    await oldLimit('mailbox', 'archive', 'per_window', 20)
    const before = await db.selectFrom('limits').select('id').executeTakeFirstOrThrow()
    await db.insertInto('limit_counters_window').values({ limit_id: before.id, window_start: 1000, count: 7 }).execute()

    const { up } = await import('../migrations/20260605000000_limit_origin.js')
    await up(db as unknown as Parameters<typeof up>[0])

    const after = await db.selectFrom('limits').select(['id', 'origin']).executeTakeFirstOrThrow()
    expect(after).toEqual({ id: before.id, origin: 'seeded' })
    const counter = await db.selectFrom('limit_counters_window').select(['limit_id', 'count']).executeTakeFirstOrThrow()
    expect(counter).toEqual({ limit_id: before.id, count: 7 })
  })

  it('lets a user cap layer over a seeded one once the uniqueness is widened', async () => {
    await oldLimit('pushover_api', 'send_notification', 'per_window', 10)
    const { up } = await import('../migrations/20260605000000_limit_origin.js')
    await up(db as unknown as Parameters<typeof up>[0])

    await db
      .insertInto('limits')
      .values({
        user_id: 1,
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_window',
        origin: 'user',
        max_count: 2,
        window_seconds: 600,
        created_at: 2000,
      })
      .execute()

    const bound = await db
      .selectFrom('limits')
      .select(['origin', 'max_count'])
      .where('resource', '=', 'pushover_api')
      .orderBy('origin', 'asc')
      .execute()
    expect(bound).toEqual([
      { origin: 'seeded', max_count: 10 },
      { origin: 'user', max_count: 2 },
    ])
  })
})
