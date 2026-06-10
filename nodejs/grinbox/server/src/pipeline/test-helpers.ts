/**
 * Test-only seeding helpers for the pipeline write-pattern tests. Not exported
 * from the package barrel — colocated so each `*.test.ts` shares one minimal
 * fixture builder over a migrated in-memory DB.
 */

import type { Kysely } from 'kysely'
import { openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { Database } from '../db/schema.js'

export async function freshDb(): Promise<Kysely<Database>> {
  const db = openDatabase(':memory:')
  await runMigrations(db)
  return db
}

export interface SeedResult {
  readonly userId: number
  readonly pipelineId: number
  readonly accountId: number
  readonly messageId: number
}

/** Seed a single user, pipeline, account, and message; return their ids. */
export async function seedBase(db: Kysely<Database>): Promise<SeedResult> {
  const ts = 1000
  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: ts })
    .returning('id')
    .executeTakeFirstOrThrow()
  const pipeline = await db
    .insertInto('pipelines')
    .values({ user_id: user.id, name: 'p', description: null, created_at: ts })
    .returning('id')
    .executeTakeFirstOrThrow()
  const account = await db
    .insertInto('accounts')
    .values({
      user_id: user.id,
      name: 'a',
      provider_type: 'gmail',
      active_pipeline_id: pipeline.id,
      settings_json: '{}',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const message = await db
    .insertInto('messages')
    .values({
      account_id: account.id,
      backend_message_id: 'm1',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return {
    userId: user.id,
    pipelineId: pipeline.id,
    accountId: account.id,
    messageId: message.id,
  }
}

/** Seed a user-scoped pushover Credential; return its id. */
export async function seedPushoverCredential(db: Kysely<Database>, userId: number): Promise<number> {
  const cred = await db
    .insertInto('credentials')
    .values({
      user_id: userId,
      account_id: null,
      kind: 'pushover',
      data_enc: Buffer.from('x'),
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return cred.id
}

/** A valid Rule-based Tagger config JSON producing `outputKey`. */
export function taggerConfig(outputKey: string): string {
  return JSON.stringify({
    output_tag_key: outputKey,
    output_value_enum: ['yes', 'no'],
    rules: [],
    fallback: { output: 'no' },
  })
}

/** A valid Notify config JSON referencing `credentialId`. */
export function notifyConfig(credentialId: number): string {
  return JSON.stringify({
    message_template: 'hi',
    credentials_id: credentialId,
  })
}
