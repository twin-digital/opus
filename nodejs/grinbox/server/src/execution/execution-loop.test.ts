import { type Kysely, sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import type { OperatorSnapshot } from '../operators/run.js'
import { createOperator } from '../pipeline/operator-save.js'
import { type SeedResult, freshDb, seedBase, seedPushoverCredential, taggerConfig } from '../pipeline/test-helpers.js'
import { enqueueTriage } from '../pipeline/triage-enqueue.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import { staticMakeUnderlyingClients } from '../resources/underlying-clients.js'
import { createExecutionLoop } from './execution-loop.js'
import type { SnapshotContract } from './resolve-contract.js'

/**
 * Execution-loop integration tests against a migrated in-memory DB. Everything
 * is driven through `tick()` / `runUntilIdle()` — no `start()` interval, no
 * timers — so each test is deterministic and cannot hang.
 */

/** Underlying clients that throw if any operation is invoked. Rule-based
 * pipelines never touch them. */
function throwingClients(): UnderlyingClients {
  const fail = () => {
    throw new Error('resource op should not be called in this test')
  }
  return {
    llm_bedrock: { invoke_model: fail },
    gmail_api: {
      apply_label: fail,
      send_message: fail,
      fetch_metadata: fail,
      list_messages: fail,
    },
    pushover_api: { send_notification: fail },
  }
}

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

describe('execution loop — worker-pool bounding', () => {
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

  it('a single tick dispatches at most workerPoolSize satisfied runs', async () => {
    // Three independent Rule-based Taggers (no inputs → all satisfied at once)
    // in one Triage, but a pool of 2: the tick may dispatch only 2. Removing the
    // `dispatched >= slots` cap would let all 3 dispatch and fail this.
    for (const key of ['a', 'b', 'c']) {
      await createOperator(db, {
        pipelineId: seed.pipelineId,
        name: key,
        typeKey: 'rule_based_tagger',
        configJson: taggerConfig(key),
        enabled: true,
        actorUserId: null,
      })
    }
    await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig({ workerPoolSize: 2 }),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
    })
    const dispatched = await loop.tick()
    expect(dispatched).toBe(2)

    // Drain the remainder so the test leaves nothing in flight.
    await loop.runUntilIdle()
    await loop.stop()
  })
})

describe('execution loop — shutdown drain', () => {
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

  it('stop() awaits a worker that is genuinely in-flight', async () => {
    // An llm_tagger whose Bedrock call only resolves when we release it. We tick
    // once to dispatch the worker (it then blocks inside invoke_model), call
    // stop() (which must await the in-flight worker), release the call, and
    // confirm stop() only resolves AFTER the run reaches a terminal state.
    let release: (() => void) | null = null
    let invoked = false
    let signalInvoked: (() => void) | null = null
    const invokedPromise = new Promise<void>((resolve) => {
      signalInvoked = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const configJson = JSON.stringify({
      model_id: 'anthropic.claude',
      prompt_template: 'classify {{subject}}',
      outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
    })
    const clients: UnderlyingClients = {
      llm_bedrock: {
        invoke_model: async () => {
          invoked = true
          signalInvoked?.()
          await gate
          return {
            text: '{"urgency": "high"}',
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsdMicros: 1,
          }
        },
      },
      gmail_api: {
        apply_label: () => {
          throw new Error('unused')
        },
        send_message: () => {
          throw new Error('unused')
        },
        fetch_metadata: () => {
          throw new Error('unused')
        },
        list_messages: () => {
          throw new Error('unused')
        },
      },
      pushover_api: {
        send_notification: () => {
          throw new Error('unused')
        },
      },
    }

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

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(clients),
    })

    const dispatched = await loop.tick()
    expect(dispatched).toBe(1)
    // The worker's async body runs after tick() returns; wait until it reaches
    // (and blocks inside) invoke_model.
    await invokedPromise
    expect(invoked).toBe(true)

    // The run is still `running` — the worker is blocked inside invoke_model.
    const running = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(running.status).toBe('running')

    // stop() must not resolve until the in-flight worker drains. Race it against
    // a marker resolved only after we release the gate.
    let stopResolved = false
    const stopPromise = loop.stop().then(() => {
      stopResolved = true
    })

    // Give the microtask queue a chance: stop() should still be pending.
    await Promise.resolve()
    expect(stopResolved).toBe(false)

    // Release the blocked call; the worker finishes + persists, then stop()
    // resolves. (`release` is assigned inside the gate's executor, which TS
    // narrowing cannot see.)
    const releaseFn = release as unknown as () => void
    releaseFn()
    await stopPromise
    expect(stopResolved).toBe(true)

    const run = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')
  })
})

describe('execution loop — rule-based pipeline', () => {
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

  it('runs a single Rule-based Tagger to completion and settles completed', async () => {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
    })
    await loop.runUntilIdle()
    await loop.stop()

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    const tag = await db
      .selectFrom('tags')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('key', '=', 'urgency')
      .executeTakeFirstOrThrow()
    expect(tag.value).toBe('no') // fallback

    const triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    expect(triage.status).toBe('completed')

    const current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('message_id', '=', seed.messageId)
      .where('pipeline_id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(current.triage_id).toBe(triageId)
  })
})

/**
 * For cross-Operator dependency / cascade tests we inject a synthetic contract
 * resolver that maps each Operator's snapshot to declared inputs/outputs via a
 * `_inputs` array + output key in the config — independent of how the real
 * built-ins derive their Contract, so a chain's shape is set explicitly.
 * Operator A produces `a`; Operator B declares input `a` and produces `b`.
 * (For the production derivation path see the "real contract derivation"
 * suite below, which drives the executor through `resolveSnapshotContract`.)
 */
describe('execution loop — dependency ordering and cascade', () => {
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

  /** Resolve declared inputs from a synthetic `_inputs` array in the config. */
  function syntheticResolve(snapshot: OperatorSnapshot): SnapshotContract {
    const cfg = JSON.parse(snapshot.op_config_json) as {
      output_tag_key: string
      _inputs?: string[]
    }
    return {
      inputKeys: cfg._inputs ?? [],
      outputKeys: [cfg.output_tag_key],
    }
  }

  /** A rule-based config that always emits `value` for `outputKey`, carrying a
   * synthetic `_inputs` declaration the resolver reads (the operator's real
   * runtime ignores `_inputs`). */
  function depConfig(outputKey: string, value: 'yes' | 'no', inputs: string[]): string {
    return JSON.stringify({
      output_tag_key: outputKey,
      output_value_enum: ['yes', 'no'],
      rules: [],
      fallback: { output: value },
      _inputs: inputs,
    })
  }

  it('B waits for A, then runs once A produces its output', async () => {
    const aId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'A',
      typeKey: 'rule_based_tagger',
      configJson: depConfig('a', 'yes', []),
      enabled: true,
      actorUserId: null,
    })
    const bId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'B',
      typeKey: 'rule_based_tagger',
      configJson: depConfig('b', 'no', ['a']),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
      resolveContract: syntheticResolve,
    })

    // One tick: only A is satisfied (B waits on input `a`). A is dispatched.
    const dispatched = await loop.tick()
    expect(dispatched).toBe(1)

    await loop.runUntilIdle()
    await loop.stop()

    const runs = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const byId = new Map(runs.map((r) => [r.operator_id, r.status]))
    expect(byId.get(aId)).toBe('completed')
    expect(byId.get(bId)).toBe('completed')

    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('completed')
  })

  it('a candidate whose snapshot is unresolvable is treated satisfied and failed by the worker', async () => {
    // Simulate a type retired (or version-bumped) after enqueue: the run's
    // snapshot carries a code_version the registry no longer matches. The default
    // resolver throws, so classification can't run → the loop treats it as
    // satisfied, claims it, and the worker fails it with the resolution error
    // (the documented per-Operator failure path). Uses the REAL resolver.
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'stale',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    // Retire the snapshot's code version: '999' matches no deployed version.
    // `type_code_version` is a never-UPDATEd Snapshot column in the schema, so
    // simulate the post-enqueue retirement with raw SQL (test-only).
    await sql`
      UPDATE triage_operator_runs SET type_code_version = '999'
      WHERE triage_id = ${triageId} AND operator_id = ${opId}
    `.execute(db)

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
    })
    await loop.runUntilIdle()
    await loop.stop()

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
    expect(run.error_summary).toContain('999')

    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
  })

  it('runUntilIdle throws when progress stalls (work remains, nothing dispatched)', async () => {
    // B waits on input `a` owned by A; A is a stale `running` row no worker is
    // driving (e.g. a row the recovery sweep would normally clear). A tick
    // dispatches nothing (A isn't `pending`; B waits), nothing is in flight, yet
    // a non-terminal run remains → runUntilIdle surfaces the stall rather than
    // spinning.
    const aId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'A',
      typeKey: 'rule_based_tagger',
      configJson: depConfig('a', 'yes', []),
      enabled: true,
      actorUserId: null,
    })
    await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'B',
      typeKey: 'rule_based_tagger',
      configJson: depConfig('b', 'no', ['a']),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    // Wedge A into `running` without dispatching it.
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'running', started_at: 1500 })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', aId)
      .execute()

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
      resolveContract: syntheticResolve,
    })
    await expect(loop.runUntilIdle()).rejects.toThrow(/stalled/)
    await loop.stop()
  })

  it('cascade skip: A fails → B definitively_missing → skipped → Triage partial', async () => {
    // A produces `a`; B declares input `a`. A is given a Rule whose `match`
    // expression passes save-time validation (a non-empty, non-`*` string) but
    // fails to compile at run time → A throws → its output `a` is never produced
    // → B cascade-skips. This exercises the failure path without touching A's
    // immutable run snapshot.
    const aId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'A',
      typeKey: 'rule_based_tagger',
      configJson: JSON.stringify({
        output_tag_key: 'a',
        output_value_enum: ['yes', 'no'],
        // Malformed match expression: unbalanced parens compile-fail at run time.
        rules: [{ match: '(((', output: 'yes' }],
        fallback: { output: 'no' },
        _inputs: [],
      }),
      enabled: true,
      actorUserId: null,
    })
    const bId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'B',
      typeKey: 'rule_based_tagger',
      configJson: depConfig('b', 'no', ['a']),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(throwingClients()),
      resolveContract: syntheticResolve,
    })
    await loop.runUntilIdle()
    await loop.stop()

    const runs = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const byId = new Map(runs.map((r) => [r.operator_id, r.status]))
    expect(byId.get(aId)).toBe('failed')
    expect(byId.get(bId)).toBe('skipped')

    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
  })
})

/**
 * The seam this bug lived in: a `notify` that gates on a Tag an upstream tagger
 * produces must run *after* the tagger, and its `when` gate must observe the
 * produced Tag. These tests drive the executor through the PRODUCTION contract
 * derivation (`resolveSnapshotContract` over the real registry → the real
 * `contractFromConfig`) — no injected `resolveContract` — so they exercise the
 * actual `inputs` derivation, not a synthetic stand-in. Before the fix the
 * derived `inputs` were always empty, so the notify ran concurrently with (and
 * usually before) the tagger and saw no Tag.
 */
describe('execution loop — notify gating on an upstream-produced Tag (real derivation)', () => {
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

  /** An llm_tagger config producing the single `urgency` Tag. */
  const taggerCfg = JSON.stringify({
    model_id: 'anthropic.claude',
    prompt_template: 'classify {{subject}}',
    outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
  })

  /** A notify config gating on `urgency == high`, referencing `credId`. */
  function notifyGatedCfg(credId: number): string {
    return JSON.stringify({
      message_template: 'urgent: {{subject}}',
      credentials_id: credId,
      when: { tag_key: 'urgency', equals: ['high'] },
    })
  }

  /**
   * Clients whose bedrock returns the given urgency value, and whose pushover
   * records each send. `bedrockGate`, if provided, blocks `invoke_model` until
   * resolved (so a test can observe the tagger still in-flight); `onInvoke`
   * signals that the (blocked) call has been entered.
   */
  function clientsFor(opts: {
    urgency: 'high' | 'low'
    sends: string[]
    bedrockGate?: Promise<void>
    onInvoke?: () => void
  }): UnderlyingClients {
    return {
      llm_bedrock: {
        invoke_model: async () => {
          opts.onInvoke?.()
          if (opts.bedrockGate) {
            await opts.bedrockGate
          }
          return {
            text: JSON.stringify({ urgency: opts.urgency }),
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsdMicros: 1,
          }
        },
      },
      gmail_api: {
        apply_label: () => {
          throw new Error('unused')
        },
        send_message: () => {
          throw new Error('unused')
        },
        fetch_metadata: () => {
          throw new Error('unused')
        },
        list_messages: () => {
          throw new Error('unused')
        },
      },
      pushover_api: {
        send_notification: async (args) => {
          opts.sends.push(args.message)
          return { message_id: `m${opts.sends.length}` }
        },
      },
    }
  }

  async function buildPipeline(): Promise<{
    taggerId: number
    notifyId: number
  }> {
    const credId = await seedPushoverCredential(db, seed.userId)
    const taggerId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'llm_tagger',
      configJson: taggerCfg,
      enabled: true,
      actorUserId: null,
    })
    const notifyId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: notifyGatedCfg(credId),
      enabled: true,
      actorUserId: null,
    })
    return { taggerId, notifyId }
  }

  it('holds the notify until the tagger settles (ordering edge is honored)', async () => {
    const { taggerId, notifyId } = await buildPipeline()
    const sends: string[] = []
    let releaseBedrock: (() => void) | null = null
    const bedrockGate = new Promise<void>((r) => {
      releaseBedrock = r
    })
    let signalInvoked: (() => void) | null = null
    const invoked = new Promise<void>((r) => {
      signalInvoked = r
    })

    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(
        clientsFor({
          urgency: 'high',
          sends,
          bedrockGate,
          onInvoke: () => signalInvoked?.(),
        }),
      ),
      // NOTE: no `resolveContract` override → real `resolveSnapshotContract`.
    })

    // One tick: only the tagger is satisfiable (the notify's `urgency` input is
    // still being produced). The tagger dispatches; the notify does not.
    const dispatched = await loop.tick()
    expect(dispatched).toBe(1)
    await invoked

    const before = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const beforeById = new Map(before.map((r) => [r.operator_id, r.status]))
    expect(beforeById.get(taggerId)).toBe('running')
    // The edge is honored: the notify is NOT ready/claimed while the tagger runs.
    expect(beforeById.get(notifyId)).toBe('pending')
    expect(sends).toHaveLength(0)

    // Release the tagger; the notify becomes eligible only now. (Assigned
    // inside the gate's executor, which TS narrowing cannot see.)
    const releaseFn = releaseBedrock as unknown as () => void
    releaseFn()
    await loop.runUntilIdle()
    await loop.stop()

    const after = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const afterById = new Map(after.map((r) => [r.operator_id, r.status]))
    expect(afterById.get(taggerId)).toBe('completed')
    expect(afterById.get(notifyId)).toBe('completed')
    // Gate matched (`urgency == high`): the notification fired exactly once.
    expect(sends).toHaveLength(1)
  })

  it('fires the notify when the produced Tag matches the gate', async () => {
    await buildPipeline()
    const sends: string[] = []
    await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(clientsFor({ urgency: 'high', sends })),
    })
    await loop.runUntilIdle()
    await loop.stop()
    expect(sends).toEqual(['urgent: '])
  })

  it('does not fire the notify when the produced Tag fails the gate', async () => {
    const { notifyId } = await buildPipeline()
    const sends: string[] = []
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(clientsFor({ urgency: 'low', sends })),
    })
    await loop.runUntilIdle()
    await loop.stop()
    // The notify still ran (it was ordered after the tagger and its inputs were
    // satisfied), but the `when` gate did not match `low` → clean no-op.
    expect(sends).toHaveLength(0)
    const notifyRun = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', notifyId)
      .executeTakeFirstOrThrow()
    expect(notifyRun.status).toBe('completed')
  })

  it('holds a notify that depends on the produced Tag ONLY via its message_template', async () => {
    // No `when` gate — the notify's sole dependency on `urgency` comes from the
    // `{{tag.urgency}}` ref in its template. The ordering edge must still form,
    // so the notify waits for the tagger and then renders the produced value
    // (not a blank). This is the I4 template-path analogue of the gate test.
    const credId = await seedPushoverCredential(db, seed.userId)
    const taggerId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'llm_tagger',
      configJson: taggerCfg,
      enabled: true,
      actorUserId: null,
    })
    const notifyId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: JSON.stringify({
        message_template: 'level={{tag.urgency}}',
        credentials_id: credId,
      }),
      enabled: true,
      actorUserId: null,
    })

    const sends: string[] = []
    let releaseBedrock: (() => void) | null = null
    const bedrockGate = new Promise<void>((r) => {
      releaseBedrock = r
    })
    let signalInvoked: (() => void) | null = null
    const invoked = new Promise<void>((r) => {
      signalInvoked = r
    })

    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(
        clientsFor({
          urgency: 'high',
          sends,
          bedrockGate,
          onInvoke: () => signalInvoked?.(),
        }),
      ),
      // Real `resolveSnapshotContract` → inputs derived from the template.
    })

    const dispatched = await loop.tick()
    expect(dispatched).toBe(1)
    await invoked

    const before = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const beforeById = new Map(before.map((r) => [r.operator_id, r.status]))
    expect(beforeById.get(taggerId)).toBe('running')
    // The template-derived edge is honored: the notify is held while the tagger runs.
    expect(beforeById.get(notifyId)).toBe('pending')
    expect(sends).toHaveLength(0)

    // Assigned inside the gate's executor, which TS narrowing cannot see.
    const releaseFn = releaseBedrock as unknown as () => void
    releaseFn()
    await loop.runUntilIdle()
    await loop.stop()

    const after = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const afterById = new Map(after.map((r) => [r.operator_id, r.status]))
    expect(afterById.get(taggerId)).toBe('completed')
    expect(afterById.get(notifyId)).toBe('completed')
    // Ordered after the producer, so the template rendered the produced value.
    expect(sends).toEqual(['level=high'])
  })
})
