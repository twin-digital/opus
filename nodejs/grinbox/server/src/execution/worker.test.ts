import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { claimOperatorRun } from '../pipeline/claim.js'
import { createOperator } from '../pipeline/operator-save.js'
import { type SeedResult, freshDb, seedBase } from '../pipeline/test-helpers.js'
import { enqueueTriage } from '../pipeline/triage-enqueue.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import { staticMakeUnderlyingClients } from '../resources/underlying-clients.js'
import { type WorkerRunRow, runWorker } from './worker.js'

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    dbPath: ':memory:',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    tokenEncKey: Buffer.alloc(32),
    operatorTimeoutMs: 30_000,
    workerPoolSize: 3,
    ...overrides,
  } as Config
}

/**
 * Underlying clients with a non-throwing fake `invoke_model` that returns a
 * valid enum value plus token usage. Drives the resource-using `llm_tagger`
 * through the real metered-client factory so the worker's
 * `mergeUsage`→`resource_usage_json` and `resource_op_succeeded` event wiring is
 * exercised end-to-end. `usage` is recorded so a test can correlate it with the
 * persisted `resource_usage_json`. Gmail/Pushover throw — only Bedrock is used.
 */
function fakeBedrockClients(value: {
  text: string
  inputTokens: number
  outputTokens: number
  costUsdMicros: number
}): UnderlyingClients {
  const unused = () => {
    throw new Error('not used in this test')
  }
  return {
    llm_bedrock: {
      invoke_model: async () => ({
        text: value.text,
        usage: {
          inputTokens: value.inputTokens,
          outputTokens: value.outputTokens,
        },
        costUsdMicros: value.costUsdMicros,
      }),
    },
    gmail_api: {
      apply_label: unused,
      send_message: unused,
      fetch_metadata: unused,
      list_messages: unused,
    },
    pushover_api: { send_notification: unused },
  }
}

/** An llm_bedrock client whose `invoke_model` resolves only when its signal
 * aborts — simulating an Operator that runs past the timeout but honors abort. */
function slowBedrockClients(): UnderlyingClients {
  const unused = () => {
    throw new Error('not used in this test')
  }
  return {
    llm_bedrock: {
      invoke_model: (_args, signal) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(new Error('aborted'))
            return
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted by signal'))
            },
            { once: true },
          )
        }),
    },
    gmail_api: {
      apply_label: unused,
      send_message: unused,
      fetch_metadata: unused,
      list_messages: unused,
    },
    pushover_api: { send_notification: unused },
  }
}

describe('runWorker — timeout enforcement', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('an Operator whose Resource call exceeds the timeout is marked failed', async () => {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'llm',
      typeKey: 'llm_tagger',
      configJson: JSON.stringify({
        model_id: 'anthropic.claude',
        prompt_template: 'classify {{subject}}',
        outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
      }),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    // Claim the run (as the loop would) before dispatching to the worker.
    await claimOperatorRun(db, triageId, opId, 1500)

    const row: WorkerRunRow = {
      triage_id: triageId,
      operator_id: opId,
      message_id: seed.messageId,
      type_key: 'llm_tagger',
      type_code_version: '1',
      op_config_json: JSON.stringify({
        model_id: 'anthropic.claude',
        prompt_template: 'classify {{subject}}',
        outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
      }),
    }

    // Small timeout keeps the test fast and bounded.
    await runWorker(
      db,
      row,
      staticMakeUnderlyingClients(slowBedrockClients()),
      testConfig({
        operatorTimeoutMs: 25,
      }),
    )

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
    expect(run.error_summary).toContain('timed out')

    // The single run is terminal → the Triage settled (partial).
    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
  })
})

describe('runWorker — resource-using Operator wiring', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  /** Build + enqueue + claim a single `llm_tagger` run; return its row. */
  async function claimLlmTaggerRun(): Promise<{
    row: WorkerRunRow
    triageId: number
    opId: number
  }> {
    const configJson = JSON.stringify({
      model_id: 'anthropic.claude',
      prompt_template: 'classify {{subject}}',
      outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
    })
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'llm',
      typeKey: 'llm_tagger',
      configJson,
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    await claimOperatorRun(db, triageId, opId, 1500)
    const row: WorkerRunRow = {
      triage_id: triageId,
      operator_id: opId,
      message_id: seed.messageId,
      type_key: 'llm_tagger',
      type_code_version: '1',
      op_config_json: configJson,
    }
    return { row, triageId, opId }
  }

  it('persists resource_usage_json and a resource_op_succeeded event end-to-end', async () => {
    const { row, triageId, opId } = await claimLlmTaggerRun()

    // The fake Bedrock returns a valid enum value + usage; the metered factory
    // (the real one wired by the worker) records both onto the accumulators.
    await runWorker(
      db,
      row,
      staticMakeUnderlyingClients(
        fakeBedrockClients({
          text: '{"urgency": "high"}',
          inputTokens: 12,
          outputTokens: 3,
          costUsdMicros: 4500,
        }),
      ),
      testConfig(),
    )

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    // resource_usage_json must reflect the metered call, keyed by
    // "<resource>.<operation>" with the token/cost counters merged in.
    expect(run.resource_usage_json).not.toBeNull()
    const usage = JSON.parse(run.resource_usage_json as string)
    expect(usage['llm_bedrock.invoke_model']).toMatchObject({
      calls: 1,
      succeeded: 1,
      tokens_in: 12,
      tokens_out: 3,
      cost_usd_micros: 4500,
    })

    // The produced output Tag landed.
    const tag = await db
      .selectFrom('tags')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('key', '=', 'urgency')
      .executeTakeFirstOrThrow()
    expect(tag.value).toBe('high')

    // A resource_op_succeeded triage_events row landed for the invoke_model call.
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('event_type', '=', 'resource_op_succeeded')
      .execute()
    expect(events).toHaveLength(1)
    const details = JSON.parse(events[0]?.details_json as string)
    expect(details).toMatchObject({
      resource: 'llm_bedrock',
      operation: 'invoke_model',
    })
  })
})

describe('runWorker — non-timeout failure', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('a plain Operator throw yields error_summary === err.message (not "timed out")', async () => {
    // The fake Bedrock returns a non-JSON response → the llm_tagger raises
    // LlmTaggerParseError synchronously, without the abort signal firing. This is
    // the non-timeout failure branch, distinct from the timeout test above.
    const configJson = JSON.stringify({
      model_id: 'anthropic.claude',
      prompt_template: 'classify {{subject}}',
      outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
    })
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'llm',
      typeKey: 'llm_tagger',
      configJson,
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    await claimOperatorRun(db, triageId, opId, 1500)

    const row: WorkerRunRow = {
      triage_id: triageId,
      operator_id: opId,
      message_id: seed.messageId,
      type_key: 'llm_tagger',
      type_code_version: '1',
      op_config_json: configJson,
    }

    await runWorker(
      db,
      row,
      staticMakeUnderlyingClients(
        fakeBedrockClients({
          text: 'not json at all',
          inputTokens: 1,
          outputTokens: 1,
          costUsdMicros: 1,
        }),
      ),
      // A generous timeout that does NOT fire — the throw is the only failure.
      testConfig({ operatorTimeoutMs: 30_000 }),
    )

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
    // The non-timeout branch carries the operator's own error message verbatim.
    expect(run.error_summary).not.toContain('timed out')
    expect(run.error_summary).toMatch(/JSON object|not an object|parsed/i)
  })
})
