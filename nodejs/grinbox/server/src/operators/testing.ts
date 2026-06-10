/**
 * Test-double metered-client factory. Lets O1/O2 and `runOperator` be
 * unit-tested without real Bedrock/Gmail/Pushover. This is test infrastructure,
 * NOT production code — the real metered clients land in S4.
 *
 * The fake honors the same seam the worker's `buildContext` defines: it records
 * every call, returns canned {@link ResourceOpResult}s, and exposes `onEvent` /
 * `onUsage` callbacks so a test can assert the accumulation wiring works.
 */

import type { Resource, ResourceOpResult } from '@twin-digital/grinbox-shared'
import type { GmailClient, LlmBedrockClient, MakeResourceClient, PushoverClient, ResourceClients } from './types.js'

/** A recorded metered-client call: which resource/operation, with what args. */
export interface RecordedCall {
  readonly resource: Resource
  readonly operation: string
  readonly args: unknown
}

/** Canned results keyed by `"<resource>.<operation>"`; default is `succeeded`. */
export type CannedResults = Partial<Record<string, ResourceOpResult<unknown>>>

export interface FakeResourceClientsOptions {
  readonly canned?: CannedResults
  /** Mirrors the worker's accumulator hook (triage_events). */
  readonly onEvent?: (event: unknown) => void
  /** Mirrors the worker's accumulator hook (resource_usage_json). */
  readonly onUsage?: (resource: Resource, operation: string, delta: unknown) => void
}

/**
 * A `makeResourceClient` factory plus the call log it records into. Construct
 * one per test, pass `factory` to `runOperator`, then assert over `calls`.
 */
export interface FakeResourceClients {
  readonly factory: MakeResourceClient
  readonly calls: RecordedCall[]
}

export function createFakeResourceClients(options: FakeResourceClientsOptions = {}): FakeResourceClients {
  const calls: RecordedCall[] = []
  const { canned = {}, onEvent, onUsage } = options

  function record<T>(resource: Resource, operation: string, args: unknown): ResourceOpResult<T> {
    calls.push({ resource, operation, args })
    const result = (canned[`${resource}.${operation}`] as ResourceOpResult<T> | undefined) ?? {
      outcome: 'succeeded',
      value: cannedDefault(resource, operation) as T,
    }
    // Mirror the real client's accumulator pushes so tests can assert wiring.
    onEvent?.({ resource, operation, outcome: result.outcome })
    if (result.outcome === 'succeeded') {
      onUsage?.(resource, operation, { attempts: 1 })
    }
    return result
  }

  const factory = (<R extends Resource>(resource: R, _operations: readonly string[]): ResourceClients[R] => {
    switch (resource) {
      case 'llm_bedrock':
        return makeLlm(record) as ResourceClients[R]
      case 'pushover_api':
        return makePushover(record) as ResourceClients[R]
      case 'gmail_api':
        return makeGmail(record) as ResourceClients[R]
      default: {
        const exhaustive: never = resource
        throw new Error(`unknown resource ${String(exhaustive)}`)
      }
    }
  }) as MakeResourceClient

  return { factory, calls }
}

type Recorder = <T>(resource: Resource, operation: string, args: unknown) => ResourceOpResult<T>

/** A plausible default success payload per operation. */
function cannedDefault(resource: Resource, operation: string): unknown {
  if (resource === 'llm_bedrock') {
    return { text: '', usage: { inputTokens: 0, outputTokens: 0 } }
  }
  if (resource === 'pushover_api') {
    return { message_id: 'fake-pushover-id' }
  }
  // Only gmail_api remains.
  switch (operation) {
    case 'apply_label':
      return { applied: true }
    case 'send_message':
      return { message_id: 'fake-gmail-id' }
    case 'fetch_metadata':
      return { headers: {} }
    case 'list_messages':
      return { ids: [] }
  }
  return {}
}

function makeLlm(record: Recorder): LlmBedrockClient {
  return {
    invoke_model: (args) => Promise.resolve(record('llm_bedrock', 'invoke_model', args)),
  }
}

function makePushover(record: Recorder): PushoverClient {
  return {
    send_notification: (args) => Promise.resolve(record('pushover_api', 'send_notification', args)),
  }
}

function makeGmail(record: Recorder): GmailClient {
  return {
    apply_label: (args) => Promise.resolve(record('gmail_api', 'apply_label', args)),
    send_message: (args) => Promise.resolve(record('gmail_api', 'send_message', args)),
    fetch_metadata: (args) => Promise.resolve(record('gmail_api', 'fetch_metadata', args)),
    list_messages: (args) => Promise.resolve(record('gmail_api', 'list_messages', args)),
  }
}
