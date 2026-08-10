import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    mailbox: {
      apply_category: unused,
      archive: unused,
      fetch_metadata: unused,
      fetch_body: unused,
      list_messages: unused,
    },
    mail_sender: { send_message: unused },
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
    mailbox: {
      apply_category: unused,
      archive: unused,
      fetch_metadata: unused,
      fetch_body: unused,
      list_messages: unused,
    },
    mail_sender: { send_message: unused },
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
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
    const usage = JSON.parse(run.resource_usage_json as string) as Record<string, unknown>
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
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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

/**
 * Lazy body fetch (body-fetch.ts, wired through the worker): a body-consuming
 * Operator triggers a metered `mailbox.fetch_body` before its run, the body
 * is cached on the `messages` row, and a denied/failed fetch degrades — the
 * run proceeds with an empty `{{body}}` rather than failing.
 */
describe('runWorker — lazy body fetch', () => {
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

  const bodyPromptConfig = JSON.stringify({
    model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    prompt_template: 'classify this message: {{body}}',
    outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
  })

  /** Clients: recording Bedrock + a stubbed mailbox fetch_body. */
  function clientsWithBody(
    fetchBody: UnderlyingClients['mailbox']['fetch_body'],
    prompts: string[],
  ): UnderlyingClients {
    const unused = () => {
      throw new Error('not used in this test')
    }
    return {
      llm_bedrock: {
        invoke_model: async (args) => {
          prompts.push(args.prompt)
          return {
            text: '{"urgency": "high"}',
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsdMicros: 1,
          }
        },
      },
      mailbox: {
        apply_category: unused,
        archive: unused,
        fetch_metadata: unused,
        fetch_body: fetchBody,
        list_messages: unused,
      },
      mail_sender: { send_message: unused },
      pushover_api: { send_notification: unused },
    }
  }

  async function claimBodyPromptRun(): Promise<{
    row: WorkerRunRow
    triageId: number
    opId: number
  }> {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'llm',
      typeKey: 'llm_tagger',
      configJson: bodyPromptConfig,
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
    return {
      row: {
        triage_id: triageId,
        operator_id: opId,
        message_id: seed.messageId,
        type_key: 'llm_tagger',
        type_code_version: '1',
        op_config_json: bodyPromptConfig,
      },
      triageId,
      opId,
    }
  }

  it('fetches + caches the body and renders it into the prompt', async () => {
    const { row, triageId, opId } = await claimBodyPromptRun()
    const prompts: string[] = []
    const fetchBody = vi.fn(async () => ({
      bodyText: 'Wire transfer request from accounting',
      bodyHtml: '<p>Wire transfer request from accounting</p>',
    }))

    await runWorker(db, row, staticMakeUnderlyingClients(clientsWithBody(fetchBody, prompts)), testConfig())

    // The run completed and the prompt carried the real body.
    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('classify this message: Wire transfer request from accounting')

    // The body was cached on the messages row.
    const message = await db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', seed.messageId)
      .executeTakeFirstOrThrow()
    expect(message.body_text).toBe('Wire transfer request from accounting')
    expect(message.body_fetched_at).not.toBeNull()

    // The fetch was metered against this run: usage + succeeded event.
    const usage = JSON.parse(run.resource_usage_json as string) as Record<string, unknown>
    expect(usage['mailbox.fetch_body']).toMatchObject({
      calls: 1,
      succeeded: 1,
    })
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('event_type', '=', 'resource_op_succeeded')
      .execute()
    const details = events.map((e) => JSON.parse(e.details_json as string) as Record<string, unknown>)
    expect(details).toContainEqual(
      expect.objectContaining({
        resource: 'mailbox',
        operation: 'fetch_body',
      }),
    )
  })

  it('uses the cached body without refetching', async () => {
    await db
      .updateTable('messages')
      .set({ body_text: 'cached body', body_fetched_at: 999 })
      .where('id', '=', seed.messageId)
      .execute()
    const { row, triageId, opId } = await claimBodyPromptRun()
    const prompts: string[] = []
    const fetchBody = vi.fn(async () => ({ bodyText: 'x', bodyHtml: null }))

    await runWorker(db, row, staticMakeUnderlyingClients(clientsWithBody(fetchBody, prompts)), testConfig())

    expect(fetchBody).not.toHaveBeenCalled()
    expect(prompts[0]).toContain('classify this message: cached body')
    const run = await db
      .selectFrom('triage_operator_runs')
      .select('status')
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')
  })

  it('a limit-denied fetch degrades: the run completes with an empty body', async () => {
    // Replace the seeded per-window fetch_body Limit with an exhausted
    // per-message one so the metered client denies this Message's fetch.
    await db.deleteFrom('limits').where('resource', '=', 'mailbox').where('operation', '=', 'fetch_body').execute()
    await db
      .insertInto('limits')
      .values({
        user_id: seed.userId,
        resource: 'mailbox',
        operation: 'fetch_body',
        scope: 'per_message',
        origin: 'user' as const,
        max_count: 1,
        window_seconds: null,
        created_at: 1000,
      })
      .execute()
    // Consume the single per-message allowance so the run's fetch is denied.
    await db
      .insertInto('limit_counters_message')
      .values({
        limit_id: (
          await db.selectFrom('limits').select('id').where('operation', '=', 'fetch_body').executeTakeFirstOrThrow()
        ).id,
        message_id: seed.messageId,
        count: 1,
      })
      .execute()

    const { row, triageId, opId } = await claimBodyPromptRun()
    const prompts: string[] = []
    const fetchBody = vi.fn(async () => ({ bodyText: 'x', bodyHtml: null }))

    await runWorker(db, row, staticMakeUnderlyingClients(clientsWithBody(fetchBody, prompts)), testConfig())

    // The underlying fetch never ran; the run still completed with "" body.
    expect(fetchBody).not.toHaveBeenCalled()
    expect(prompts[0]).toContain('classify this message: \n')
    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    // The denial was recorded; the cache stays unfetched for a later retry.
    const limited = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('event_type', '=', 'resource_op_limited')
      .execute()
    expect(limited).toHaveLength(1)
    const message = await db
      .selectFrom('messages')
      .select('body_fetched_at')
      .where('id', '=', seed.messageId)
      .executeTakeFirstOrThrow()
    expect(message.body_fetched_at).toBeNull()
  })

  it('a non-body prompt performs no fetch', async () => {
    const configJson = JSON.stringify({
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
    const prompts: string[] = []
    const fetchBody = vi.fn(async () => ({ bodyText: 'x', bodyHtml: null }))

    await runWorker(
      db,
      {
        triage_id: triageId,
        operator_id: opId,
        message_id: seed.messageId,
        type_key: 'llm_tagger',
        type_code_version: '1',
        op_config_json: configJson,
      },
      staticMakeUnderlyingClients(clientsWithBody(fetchBody, prompts)),
      testConfig(),
    )

    expect(fetchBody).not.toHaveBeenCalled()
    const run = await db
      .selectFrom('triage_operator_runs')
      .select('status')
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')
  })
})
