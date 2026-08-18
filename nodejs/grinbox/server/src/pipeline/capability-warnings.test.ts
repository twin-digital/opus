import type { AccountCapabilityWarning } from '@grinbox/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { DB } from '../db/index.js'
import { createApiRoutes } from '../http/api/index.js'
import { fixedNow, freshDb, insertPipeline, insertUser } from '../http/api/test-support.js'
import { allCapabilities, capabilitiesFrom, serializeCapabilities } from '../providers/account-capabilities.js'
import { capabilityWarnings } from './capability-warnings.js'

/** An account that can carry nothing but categories. */
const CATEGORIES_ONLY = capabilitiesFrom(
  ['apply_category'],
  { archive: 'the server offers no safe move', file: 'the server offers no safe move' },
  0,
)

describe('capabilityWarnings (d-qzxvoph1)', () => {
  let db: DB
  let userId: number
  let pipelineId: number

  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
    pipelineId = await insertPipeline(db, userId, 'p')
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function addOperator(typeKey: string, config: unknown, enabled = 1): Promise<number> {
    const row = await db
      .insertInto('operators')
      .values({
        pipeline_id: pipelineId,
        name: typeKey,
        type_key: typeKey,
        type_code_version: '1',
        config_json: JSON.stringify(config),
        enabled,
        created_at: 0,
        updated_at: 0,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  async function addAccount(capabilities: string | null, active = true): Promise<number> {
    const row = await db
      .insertInto('accounts')
      .values({
        user_id: userId,
        name: `acct-${Math.random()}`,
        icon: null,
        color: null,
        provider_type: 'imap',
        active_pipeline_id: active ? pipelineId : null,
        settings_json: '{}',
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: capabilities,
        paused_reason: null,
        created_at: 0,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  it('names the capability, the operators needing it, and the accounts lacking it', async () => {
    const fileId = await addOperator('file', { folder: 'Receipts' })
    const lacking = await addAccount(serializeCapabilities(CATEGORIES_ONLY))
    await addAccount(serializeCapabilities(allCapabilities(0)))

    const warnings = await capabilityWarnings(db, pipelineId)
    expect(warnings).toEqual<AccountCapabilityWarning[]>([
      { capability: 'file', operator_ids: [fileId], account_ids: [lacking] },
    ])
  })

  it('warns about nothing where every account can carry the pipeline', async () => {
    await addOperator('file', { folder: 'Receipts' })
    await addAccount(serializeCapabilities(allCapabilities(0)))

    expect(await capabilityWarnings(db, pipelineId)).toEqual([])
  })

  it('says nothing about an account that has never polled', async () => {
    await addOperator('file', { folder: 'Receipts' })
    await addAccount(null)

    expect(await capabilityWarnings(db, pipelineId)).toEqual([])
  })

  it('ignores a disabled operator', async () => {
    await addOperator('file', { folder: 'Receipts' }, 0)
    await addAccount(serializeCapabilities(CATEGORIES_ONLY))

    expect(await capabilityWarnings(db, pipelineId)).toEqual([])
  })

  it('reports both halves of a set-aside, since it reaches both', async () => {
    const id = await addOperator('set_aside', { category_template: 'later', folder: 'Later' })
    const lacking = await addAccount(serializeCapabilities(CATEGORIES_ONLY))

    expect(await capabilityWarnings(db, pipelineId)).toEqual([
      { capability: 'file', operator_ids: [id], account_ids: [lacking] },
    ])
  })

  it('narrows to the accounts it was asked about', async () => {
    await addOperator('file', { folder: 'Receipts' })
    const lacking = await addAccount(serializeCapabilities(CATEGORIES_ONLY), false)
    const able = await addAccount(serializeCapabilities(allCapabilities(0)), false)

    expect(await capabilityWarnings(db, pipelineId, [able])).toEqual([])
    expect(await capabilityWarnings(db, pipelineId, [lacking])).toMatchObject([{ capability: 'file' }])
  })

  it('warns about a pipeline that reaches no account-dependent operation not at all', async () => {
    await addOperator('rule_based_tagger', {
      tag_key: 'kind',
      values: ['bill'],
      rules: [{ value: 'bill', match: "subject contains 'bill'" }],
      fallback: { kind: 'value', value: 'bill' },
    })
    await addAccount(serializeCapabilities(CATEGORIES_ONLY))

    expect(await capabilityWarnings(db, pipelineId)).toEqual([])
  })

  describe('through the write routes', () => {
    it('carries warnings beside a successful operator save, never a refusal', async () => {
      const lacking = await addAccount(serializeCapabilities(CATEGORIES_ONLY))
      const res = await createApiRoutes({ db, now: fixedNow }).request(
        new Request(`http://local/api/pipelines/${pipelineId}/operators`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'file it', type_key: 'file', config: { folder: 'Receipts' } }),
        }),
      )

      expect(res.status).toBe(201)
      const body = (await res.json()) as { id: number; warnings: AccountCapabilityWarning[] }
      expect(body.warnings).toEqual([{ capability: 'file', operator_ids: [body.id], account_ids: [lacking] }])
    })

    it('carries warnings when a pipeline is activated on an account', async () => {
      const fileId = await addOperator('file', { folder: 'Receipts' })
      const lacking = await addAccount(serializeCapabilities(CATEGORIES_ONLY), false)

      const res = await createApiRoutes({ db, now: fixedNow }).request(
        new Request(`http://local/api/accounts/${lacking}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ active_pipeline_id: pipelineId }),
        }),
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        ok: true,
        warnings: [{ capability: 'file', operator_ids: [fileId], account_ids: [lacking] }],
      })
    })
  })
})
