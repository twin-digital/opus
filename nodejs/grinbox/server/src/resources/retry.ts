/**
 * Per-Resource-operation retry policy (pipeline-runtime.md "Retry policy per
 * Resource operation"). The retry happens *inside* the client wrapper,
 * transparent to the Operator, and is entirely separate from the Limit check:
 * the Limit is consumed once before the retry loop, so all attempts of one
 * operation count once against the Limit.
 *
 * Policy table (resource.operation → behavior):
 *
 * | Operation                       | Policy                          |
 * |---------------------------------|---------------------------------|
 * | `pushover_api.send_notification`| no retry (non-idempotent)       |
 * | `gmail_api.send_message`        | no retry (double-send is bad)   |
 * | `gmail_api.apply_label`         | retry 2× with backoff           |
 * | `gmail_api.fetch_metadata`      | retry 3× with exponential backoff |
 * | `gmail_api.list_messages`       | retry 3× with exponential backoff |
 * | `llm_bedrock.invoke_model`      | retry 3× with exponential backoff |
 *
 * The `AbortSignal` is honored: if it aborts (the Operator timeout), the wrapper
 * stops retrying and rejects immediately. The underlying op is also expected to
 * receive the same signal and cancel its in-flight network call.
 */

/**
 * A retry policy for one Resource operation. `maxRetries` is the number of
 * *additional* attempts after the first (so `0` = one attempt, no retry).
 * `baseDelayMs` is the first backoff; `exponential` doubles it each retry,
 * otherwise it's constant.
 */
export interface RetryPolicy {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly exponential: boolean
}

/** No-retry policy: a single attempt. */
const NO_RETRY: RetryPolicy = {
  maxRetries: 0,
  baseDelayMs: 0,
  exponential: false,
}

/**
 * Retry policy keyed by `"<resource>.<operation>"`. The single source of truth
 * transcribing the pipeline-runtime.md table; an operation absent from this map
 * gets {@link NO_RETRY} (fail-closed: an unrecognized op is never silently
 * retried).
 */
export const RETRY_POLICIES: Readonly<Record<string, RetryPolicy>> = {
  'pushover_api.send_notification': NO_RETRY,
  'gmail_api.send_message': NO_RETRY,
  'gmail_api.apply_label': {
    maxRetries: 2,
    baseDelayMs: 200,
    exponential: false,
  },
  'gmail_api.fetch_metadata': {
    maxRetries: 3,
    baseDelayMs: 200,
    exponential: true,
  },
  'gmail_api.list_messages': {
    maxRetries: 3,
    baseDelayMs: 200,
    exponential: true,
  },
  'llm_bedrock.invoke_model': {
    maxRetries: 3,
    baseDelayMs: 200,
    exponential: true,
  },
}

/** Resolve the retry policy for `resource.operation`; defaults to no-retry. */
export function policyFor(resource: string, operation: string): RetryPolicy {
  return RETRY_POLICIES[`${resource}.${operation}`] ?? NO_RETRY
}

/** Error thrown when the AbortSignal aborts during/before a retry wait. */
export class RetryAbortedError extends Error {
  override readonly name = 'RetryAbortedError'
  constructor(reason?: unknown) {
    super(typeof reason === 'string' ? `operation aborted: ${reason}` : 'operation aborted')
  }
}

/** Sleep `ms`, rejecting early with {@link RetryAbortedError} if `signal` aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new RetryAbortedError(signal.reason))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new RetryAbortedError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Invoke `op` under the retry `policy`, honoring `signal`. Returns the first
 * successful result; rethrows the last error once retries are exhausted; aborts
 * (rejecting with the abort reason) immediately if the signal fires.
 *
 * The Limit check is NOT performed here — the caller (make-resource-client.ts)
 * consumes the Limit once before invoking this, so every attempt inside this
 * loop counts as the single Limit-charged operation.
 */
export async function withRetry<T>(policy: RetryPolicy, signal: AbortSignal, op: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (signal.aborted) {
      throw new RetryAbortedError(signal.reason)
    }
    try {
      return await op()
    } catch (err) {
      lastError = err
      // The signal aborting mid-call means the Operator timed out; don't retry.
      // (`aborted` flips while `op()` is awaited — narrowing can't see that.)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) {
        throw err
      }
      if (attempt === policy.maxRetries) {
        break
      }
      const ms = policy.exponential ? policy.baseDelayMs * 2 ** attempt : policy.baseDelayMs
      await delay(ms, signal)
    }
  }
  throw lastError instanceof Error ? lastError : (
      new Error(typeof lastError === 'string' || typeof lastError === 'number' ? String(lastError) : 'operation failed')
    )
}
