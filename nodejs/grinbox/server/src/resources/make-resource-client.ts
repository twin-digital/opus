/**
 * The metering layer: turns the injected underlying Resource clients
 * (bedrock/gmail/pushover) into the metered {@link MakeResourceClient} that
 * `runOperator` expects. Each exposed operation method:
 *
 *  1. **Limit-check** via {@link checkAndConsumeLimits} (limits.ts). On deny:
 *     push a `resource_op_limited` event, record the skip in usage, and return
 *     `{ outcome: 'skipped_by_limit', limit_id, scope }` WITHOUT calling the
 *     underlying API.
 *  2. On allow: call the underlying op through the {@link withRetry} wrapper
 *     (retry.ts) — the Limit was consumed once in step 1, so all retries count
 *     once. On success: push `resource_op_succeeded`, record usage
 *     (calls/tokens/cost per the `resource_usage_json` shape), return
 *     `{ outcome: 'succeeded', value }`. On failure: push `resource_op_failed`,
 *     return `{ outcome: 'failed', error }`.
 *
 * The returned client object exposes ONLY the declared `operations` for the
 * Resource (matching the `operators/types.ts` interfaces) — an Operator cannot
 * call an operation it didn't declare because the method isn't present.
 *
 * Every attempt is recorded against the run that made it (d-coeyvi2n), as a
 * `triage_events` row plus `triage_operator_runs.resource_usage_json`.
 *
 * **Decoupling.** This layer reads the `limits`/counter tables (policy) but
 * never the `credentials` table — the underlying clients receive their
 * auth/config by injection. See {@link UnderlyingClients}.
 */

import type { Resource } from '@grinbox/shared'
import type { DB } from '../db/schema.js'
import type {
  LlmBedrockClient,
  LlmInvokeArgs,
  MailSendArgs,
  MailSenderClient,
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxClient,
  MailboxFetchArgs,
  MailboxFileArgs,
  MailboxListArgs,
  MakeResourceClient,
  PushoverClient,
  PushoverSendArgs,
  ResourceClients,
} from '../operators/types.js'
import { checkAndConsumeLimits } from './limits.js'
import { policyFor, withRetry } from './retry.js'

/**
 * A `triage_events` payload the metered client accumulates per outcome:
 *  - `resource_op_succeeded`: `{ resource, operation, ...op-specific }`
 *  - `resource_op_limited`:  `{ resource, operation, limit_id, scope }`
 *  - `resource_op_failed`:   `{ resource, operation, error }`
 *  - `resource_op_suppressed`:      `{ kind, deferred_to_triage_id, deferred_to_operator_id }`
 *    — emitted by the notification cooldown gate, not by a metered client: a
 *    suppressed push reaches no Resource (d-6ptxams7) but records as its own
 *    outcome kind in the attempt vocabulary (d-e9jslw4x).
 */
export interface ResourceEvent {
  readonly event_type: 'resource_op_succeeded' | 'resource_op_limited' | 'resource_op_failed' | 'resource_op_suppressed'
  readonly details: Record<string, unknown>
}

/**
 * A delta merged into `triage_operator_runs.resource_usage_json`, keyed by
 * `"<resource>.<operation>"`. The worker sums these per key. Counters are
 * additive (`calls`, `succeeded`, `skipped_by_limit`, `tokens_in`,
 * `tokens_out`, `cost_usd_micros`).
 */
export interface UsageDelta {
  readonly calls?: number
  readonly succeeded?: number
  readonly skipped_by_limit?: number
  readonly tokens_in?: number
  readonly tokens_out?: number
  readonly cost_usd_micros?: number
}

/**
 * The injected underlying clients. Each method performs ONE underlying API call
 * (no Limit check, no retry, no metering — those are this module's job). The
 * args/return shapes mirror the metered-client interfaces' payloads minus the
 * `ResourceOpResult` wrapper.
 *
 * The daemon builds these over real transports + resolved credentials; tests pass
 * fakes. Constructing them is intentionally outside this module so the
 * metering/Limit layer stays decoupled from credential resolution.
 */
export interface UnderlyingClients {
  readonly llm_bedrock: {
    invoke_model(
      args: LlmInvokeArgs,
      signal: AbortSignal,
    ): Promise<{
      text: string
      usage: { inputTokens: number; outputTokens: number }
      costUsdMicros: number
    }>
  }
  readonly mailbox: {
    apply_category(args: MailboxApplyCategoryArgs, signal: AbortSignal): Promise<{ applied: boolean }>
    archive(args: MailboxArchiveArgs, signal: AbortSignal): Promise<{ archived: boolean }>
    file(args: MailboxFileArgs, signal: AbortSignal): Promise<{ filed: boolean }>
    fetch_metadata(args: MailboxFetchArgs, signal: AbortSignal): Promise<{ headers: Record<string, string> }>
    fetch_body(args: MailboxFetchArgs, signal: AbortSignal): Promise<MailboxBodyResult>
    list_messages(args: MailboxListArgs, signal: AbortSignal): Promise<{ ids: string[] }>
  }
  readonly mail_sender: {
    send_message(args: MailSendArgs, signal: AbortSignal): Promise<{ message_id: string }>
  }
  readonly pushover_api: {
    send_notification(args: PushoverSendArgs, signal: AbortSignal): Promise<{ message_id: string }>
  }
}

/**
 * Dependencies for the factory. `db`, `userId`, `messageId` drive the Limit
 * check; `signal` flows into the underlying ops + retry waits; `onEvent` /
 * `onUsage` are the accumulators the worker closes over; `clients` are the
 * injected underlying clients.
 */
export interface ResourceClientFactoryDeps {
  readonly db: DB
  readonly userId: number
  /** The run's subject Message, or `null` for a scheduled (Triage-less) run —
   * `per_message` Limits are then not applicable (see limits.ts). */
  readonly messageId: number | null
  readonly operatorId: number
  /** The run's Triage, or `null` for a scheduled (Triage-less) run. */
  readonly triageId: number | null
  readonly signal: AbortSignal
  readonly onEvent: (event: ResourceEvent) => void
  readonly onUsage: (resourceOp: string, delta: UsageDelta) => void
  readonly clients: UnderlyingClients
}

/**
 * Core of one metered operation: Limit-check, then (on allow) run `op` under the
 * retry policy and map success/failure to a {@link import('@grinbox/shared').ResourceOpResult}.
 * `onSuccessUsage` and `successDetails` let each operation contribute its
 * op-specific usage counters and event details from the underlying result.
 */
async function meter<T>(
  deps: ResourceClientFactoryDeps,
  resource: Resource,
  operation: string,
  run: () => Promise<T>,
  onSuccessUsage: (value: T) => UsageDelta,
  successDetails: (value: T) => Record<string, unknown>,
): Promise<
  | { outcome: 'succeeded'; value: T }
  | {
      outcome: 'skipped_by_limit'
      limit_id: number
      scope: 'per_window' | 'per_message'
    }
  | { outcome: 'failed'; error: Error }
> {
  const resourceOp = `${resource}.${operation}`

  // (1) Limit check — once per attempt, before the retry loop.
  const decision = await checkAndConsumeLimits(deps.db, {
    userId: deps.userId,
    resource,
    operation,
    messageId: deps.messageId,
  })

  if (!decision.allowed) {
    deps.onEvent({
      event_type: 'resource_op_limited',
      details: {
        resource,
        operation,
        limit_id: decision.limit_id,
        scope: decision.scope,
      },
    })
    deps.onUsage(resourceOp, { calls: 1, skipped_by_limit: 1 })
    return {
      outcome: 'skipped_by_limit',
      limit_id: decision.limit_id,
      scope: decision.scope,
    }
  }

  // (2) Allowed: invoke the underlying op under its retry policy.
  const policy = policyFor(resource, operation)
  try {
    const value = await withRetry(policy, deps.signal, run)
    deps.onEvent({
      event_type: 'resource_op_succeeded',
      details: { resource, operation, ...successDetails(value) },
    })
    deps.onUsage(resourceOp, {
      calls: 1,
      succeeded: 1,
      ...onSuccessUsage(value),
    })
    return { outcome: 'succeeded', value }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    deps.onEvent({
      event_type: 'resource_op_failed',
      details: { resource, operation, error: error.message },
    })
    deps.onUsage(resourceOp, { calls: 1 })
    return { outcome: 'failed', error }
  }
}

/** Build the metered `llm_bedrock` client (only `invoke_model` is declared). */
function makeLlmClient(deps: ResourceClientFactoryDeps): LlmBedrockClient {
  return {
    invoke_model: (args) =>
      meter(
        deps,
        'llm_bedrock',
        'invoke_model',
        () => deps.clients.llm_bedrock.invoke_model(args, deps.signal),
        (v) => ({
          tokens_in: v.usage.inputTokens,
          tokens_out: v.usage.outputTokens,
          cost_usd_micros: v.costUsdMicros,
        }),
        (v) => ({
          tokens_in: v.usage.inputTokens,
          tokens_out: v.usage.outputTokens,
          cost_usd_micros: v.costUsdMicros,
        }),
      ).then((r) =>
        r.outcome === 'succeeded' ?
          {
            outcome: 'succeeded' as const,
            value: { text: r.value.text, usage: r.value.usage },
          }
        : r,
      ),
  }
}

/** Build the metered `pushover_api` client. */
function makePushoverClient(deps: ResourceClientFactoryDeps): PushoverClient {
  return {
    send_notification: (args) =>
      meter(
        deps,
        'pushover_api',
        'send_notification',
        () => deps.clients.pushover_api.send_notification(args, deps.signal),
        () => ({}),
        (v) => ({ message_id: v.message_id }),
      ),
  }
}

/**
 * Build the metered `mailbox` client. All declared operations are wired; the
 * dispatcher only exposes the ones the Contract declares (see
 * {@link exposeOnly}).
 */
function makeMailboxClient(deps: ResourceClientFactoryDeps): MailboxClient {
  return {
    apply_category: (args) =>
      meter(
        deps,
        'mailbox',
        'apply_category',
        () => deps.clients.mailbox.apply_category(args, deps.signal),
        () => ({}),
        // The run records the Category actually applied, which is what the
        // mailbox now carries rather than what the template composed
        // (d-mbh2pthe).
        (v) => ({ category: args.category, applied: v.applied }),
      ),
    archive: (args) =>
      meter(
        deps,
        'mailbox',
        'archive',
        () => deps.clients.mailbox.archive(args, deps.signal),
        () => ({}),
        (v) => ({ archived: v.archived }),
      ),
    file: (args) =>
      meter(
        deps,
        'mailbox',
        'file',
        () => deps.clients.mailbox.file(args, deps.signal),
        () => ({}),
        (v) => ({ folder: args.folder, filed: v.filed }),
      ),
    fetch_metadata: (args) =>
      meter(
        deps,
        'mailbox',
        'fetch_metadata',
        () => deps.clients.mailbox.fetch_metadata(args, deps.signal),
        () => ({}),
        () => ({}),
      ),
    fetch_body: (args) =>
      meter(
        deps,
        'mailbox',
        'fetch_body',
        () => deps.clients.mailbox.fetch_body(args, deps.signal),
        () => ({}),
        (v) => ({
          has_text: v.bodyText !== null,
          has_html: v.bodyHtml !== null,
        }),
      ),
    list_messages: (args) =>
      meter(
        deps,
        'mailbox',
        'list_messages',
        () => deps.clients.mailbox.list_messages(args, deps.signal),
        () => ({}),
        (v) => ({ count: v.ids.length }),
      ),
  }
}

/** Build the metered `mail_sender` client. */
function makeMailSenderClient(deps: ResourceClientFactoryDeps): MailSenderClient {
  return {
    send_message: (args) =>
      meter(
        deps,
        'mail_sender',
        'send_message',
        () => deps.clients.mail_sender.send_message(args, deps.signal),
        () => ({}),
        (v) => ({ message_id: v.message_id }),
      ),
  }
}

/**
 * Return a shallow copy of `client` exposing only the methods named in
 * `operations`. This is what makes "Operators cannot invoke undeclared
 * operations" structural at the object level — the method literally isn't on the
 * returned object. The full client is built first (cheap closures) and then
 * narrowed.
 */
function exposeOnly<C extends object>(client: C, operations: readonly string[]): C {
  const allowed = new Set(operations)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(client) as (keyof C & string)[]) {
    if (allowed.has(key)) {
      out[key] = client[key]
    }
  }
  return out as C
}

/**
 * Build the {@link MakeResourceClient} `runOperator` calls once per declared
 * Resource. The worker constructs this factory closing over the timeout
 * signal + event/usage accumulators, then passes the returned function as
 * `runOperatorArgs.makeResourceClient`.
 */
export function createResourceClientFactory(deps: ResourceClientFactoryDeps): MakeResourceClient {
  return <R extends Resource>(resource: R, operations: readonly string[]): ResourceClients[R] => {
    switch (resource) {
      case 'llm_bedrock':
        return exposeOnly(makeLlmClient(deps), operations) as ResourceClients[R]
      case 'pushover_api':
        return exposeOnly(makePushoverClient(deps), operations) as ResourceClients[R]
      case 'mailbox':
        return exposeOnly(makeMailboxClient(deps), operations) as ResourceClients[R]
      case 'mail_sender':
        return exposeOnly(makeMailSenderClient(deps), operations) as ResourceClients[R]
      default: {
        const exhaustive: never = resource
        throw new Error(`unknown resource: ${String(exhaustive)}`)
      }
    }
  }
}
