/**
 * Test-only seed helpers for the `/api` route tests. Colocated (not exported
 * from the package barrel) so each `*.test.ts` shares one fixture builder over a
 * migrated in-memory DB. Timestamps are fixed so window math is assertable.
 */

import type { Kysely } from 'kysely'
import { openDatabase } from '../../db/connection.js'
import type { DB } from '../../db/index.js'
import { runMigrations } from '../../db/migrator.js'
import type { Database, SourceState } from '../../db/schema.js'

/** A fixed "now" the time-window tests anchor on (UNIX seconds). */
export const FIXED_NOW = 1_700_000_000
export const fixedNow = () => FIXED_NOW

export async function freshDb(): Promise<DB> {
  const db = openDatabase(':memory:')
  await runMigrations(db)
  return db
}

interface InsertOpts {
  readonly ts?: number
}

export async function insertUser(db: Kysely<Database>, name = 'u', opts: InsertOpts = {}): Promise<number> {
  const r = await db
    .insertInto('users')
    .values({
      name,
      email: `${name}@example.com`,
      created_at: opts.ts ?? 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export async function insertPipeline(
  db: Kysely<Database>,
  userId: number,
  name = 'p',
  description: string | null = null,
): Promise<number> {
  const r = await db
    .insertInto('pipelines')
    .values({ user_id: userId, name, description, created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export async function insertAccount(
  db: Kysely<Database>,
  userId: number,
  values: {
    name?: string
    activePipelineId?: number | null
    lastPolledAt?: number | null
    pollInterval?: number
    providerType?: string
  } = {},
): Promise<number> {
  const r = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: values.name ?? 'a',
      provider_type: values.providerType ?? 'gmail',
      active_pipeline_id: values.activePipelineId ?? null,
      settings_json: '{}',
      poll_interval_seconds: values.pollInterval ?? 600,
      last_polled_at: values.lastPolledAt ?? null,
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export async function insertGmailCredential(db: Kysely<Database>, userId: number, accountId: number): Promise<number> {
  const r = await db
    .insertInto('credentials')
    .values({
      user_id: userId,
      account_id: accountId,
      kind: 'gmail_oauth',
      data_enc: Buffer.from('x'),
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export async function insertCredential(
  db: Kysely<Database>,
  userId: number,
  values: {
    kind: string
    accountId?: number | null
    dataEnc?: Buffer
    createdAt?: number
    updatedAt?: number | null
  },
): Promise<number> {
  const r = await db
    .insertInto('credentials')
    .values({
      user_id: userId,
      account_id: values.accountId ?? null,
      kind: values.kind,
      data_enc: values.dataEnc ?? Buffer.from('secret-blob'),
      created_at: values.createdAt ?? 1000,
      updated_at: values.updatedAt ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export async function insertOperator(
  db: Kysely<Database>,
  pipelineId: number,
  values: {
    name: string
    typeKey: string
    configJson: string
    enabled?: boolean
  },
): Promise<number> {
  const r = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: values.name,
      type_key: values.typeKey,
      type_code_version: '1',
      config_json: values.configJson,
      enabled: values.enabled === false ? 0 : 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

export function ruleTaggerConfig(outputKey: string, valueEnum: string[] = ['yes', 'no']): string {
  return JSON.stringify({
    output_tag_key: outputKey,
    output_value_enum: valueEnum,
    rules: [],
    fallback: { output: valueEnum[0] },
  })
}

export async function insertMessage(
  db: Kysely<Database>,
  accountId: number,
  values: {
    backendMessageId: string
    from?: string | null
    subject?: string | null
    snippet?: string | null
    receivedAt?: number | null
    bodyText?: string | null
    sourceState?: SourceState
  },
): Promise<number> {
  const r = await db
    .insertInto('messages')
    .values({
      account_id: accountId,
      backend_message_id: values.backendMessageId,
      from_header: values.from ?? null,
      subject: values.subject ?? null,
      snippet: values.snippet ?? null,
      received_at: values.receivedAt ?? null,
      body_text: values.bodyText ?? null,
      created_at: 1000,
      source_state: values.sourceState ?? 'present',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return r.id
}

/**
 * Insert a settled Triage with one Operator run, optionally marking it current
 * for its `(message, pipeline)` and attaching Tags / events. Returns the new
 * triage id.
 */
export async function insertTriage(
  db: Kysely<Database>,
  values: {
    messageId: number
    pipelineId: number
    operatorId: number
    typeKey?: string
    status?: 'running' | 'completed' | 'partial' | 'failed'
    triggeredBy?: 'message_arrival' | 'user_replay' | 'user_reset_and_replay' | 'pipeline_changed' | 'scheduled_replay'
    startedAt: number
    endedAt?: number | null
    runStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    runError?: string | null
    resourceUsageJson?: string | null
    makeCurrent?: boolean
    tags?: { key: string; value: string }[]
    events?: {
      eventType: 'tag_set' | 'resource_op_succeeded' | 'resource_op_limited' | 'resource_op_failed'
      detailsJson?: string | null
      recordedAt: number
    }[]
  },
): Promise<number> {
  const status = values.status ?? 'completed'
  const triage = await db
    .insertInto('triages')
    .values({
      message_id: values.messageId,
      pipeline_id: values.pipelineId,
      triggered_by: values.triggeredBy ?? 'message_arrival',
      actor_user_id: null,
      started_at: values.startedAt,
      ended_at:
        values.endedAt === undefined ?
          status === 'running' ?
            null
          : values.startedAt + 1
        : values.endedAt,
      status,
      error_summary: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const runStatus = values.runStatus ?? 'completed'
  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triage.id,
      operator_id: values.operatorId,
      message_id: values.messageId,
      type_key: values.typeKey ?? 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: '{}',
      status: runStatus,
      started_at: values.startedAt,
      finished_at: runStatus === 'pending' || runStatus === 'running' ? null : values.startedAt + 1,
      duration_ms: 5,
      skip_reason: null,
      error_summary: values.runError ?? null,
      resource_usage_json: values.resourceUsageJson ?? null,
      created_at: values.startedAt,
    })
    .execute()

  if (values.tags && values.tags.length > 0) {
    await db
      .insertInto('tags')
      .values(
        values.tags.map((t) => ({
          triage_id: triage.id,
          operator_id: values.operatorId,
          key: t.key,
          value: t.value,
          created_at: values.startedAt,
        })),
      )
      .execute()
  }

  if (values.events && values.events.length > 0) {
    let seq = 0
    for (const e of values.events) {
      seq += 1
      await db
        .insertInto('triage_events')
        .values({
          triage_id: triage.id,
          operator_id: values.operatorId,
          sequence_num: seq,
          event_type: e.eventType,
          details_json: e.detailsJson ?? null,
          recorded_at: e.recordedAt,
        })
        .execute()
    }
  }

  if (values.makeCurrent) {
    await db
      .insertInto('current_triages')
      .values({
        message_id: values.messageId,
        pipeline_id: values.pipelineId,
        triage_id: triage.id,
        triage_started_at: values.startedAt,
        updated_at: values.startedAt,
      })
      .onConflict((oc) =>
        oc.columns(['message_id', 'pipeline_id']).doUpdateSet({
          triage_id: triage.id,
          triage_started_at: values.startedAt,
          updated_at: values.startedAt,
        }),
      )
      .execute()
  }

  return triage.id
}
