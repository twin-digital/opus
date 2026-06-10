import type { LimitScope } from './enums.js'

/**
 * The discriminated result every metered Resource-client operation returns, so
 * the Operator can choose how to react. From pipeline-runtime.md "Resource
 * clients and operation outcomes".
 *
 * This is a runtime-internal result type, not a wire/persisted shape, so it's a
 * TS type only — no Zod schema. (Limit hits and failures are recorded as
 * `triage_events`, not as this object.)
 *
 *  - `succeeded` — the underlying API call returned; `value` is the
 *    operation-specific payload.
 *  - `skipped_by_limit` — a Limit denied the call; the external API was never
 *    invoked. Carries the `limit_id` that fired and its `scope`.
 *  - `failed` — the call failed after the operation's retry policy was
 *    exhausted.
 */
export type ResourceOpResult<T> =
  | { outcome: 'succeeded'; value: T }
  | { outcome: 'skipped_by_limit'; limit_id: number; scope: LimitScope }
  | { outcome: 'failed'; error: Error }
