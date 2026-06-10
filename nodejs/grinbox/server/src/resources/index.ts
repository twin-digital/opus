/**
 * S4 — metered Resource clients + Limit enforcement. The public surface the
 * worker (S7) wires into `runOperator`, and the underlying-client builders S6/M2
 * fills with real transports + resolved credentials.
 *
 * Layering (top → bottom):
 *  - `createResourceClientFactory` — the metering layer producing the
 *    `MakeResourceClient` `runOperator` expects.
 *  - `checkAndConsumeLimits` — the Limit engine over the `limits`/counter tables.
 *  - `withRetry` / `policyFor` — the per-operation retry policy.
 *  - `bedrock` / `gmail` / `pushover` — the injectable underlying transports.
 */

export {
  createResourceClientFactory,
  type ResourceClientFactoryDeps,
  type ResourceEvent,
  type UnderlyingClients,
  type UsageDelta,
} from './make-resource-client.js'

export {
  buildUnderlyingClients,
  buildMakeUnderlyingClients,
  staticMakeUnderlyingClients,
  type MakeUnderlyingClients,
  type MakeUnderlyingClientsDeps,
  type UnderlyingClientsRunContext,
} from './underlying-clients.js'

export { checkAndConsumeLimits, type LimitDecision } from './limits.js'

export { policyFor, type RetryPolicy, RETRY_POLICIES, RetryAbortedError, withRetry } from './retry.js'

export {
  type BedrockInvokeResult,
  type BedrockSend,
  BedrockResponseError,
  computeCostUsdMicros,
  invokeModel,
  makeBedrockSend,
  MODEL_INFERENCE_PROFILES,
  resolveInferenceProfile,
  UnmappedModelError,
} from './bedrock.js'

export {
  applyLabel,
  fetchMetadata,
  type GmailAuthProvider,
  type GmailDeps,
  type GmailOAuth2Client,
  listMessages,
  sendMessage,
} from './gmail.js'

export {
  type FetchLike,
  PushoverApiError,
  type PushoverCredentials,
  type PushoverDeps,
  PUSHOVER_MESSAGES_URL,
  sendNotification,
} from './pushover.js'
