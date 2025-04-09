# Snavio Messaging System

## Section A: System Overview

### 📌 Purpose

The Snavio messaging system enables secure, structured, and scalable command delivery across distributed services. Its goal is to provide:

- 🔌 Decoupled command emission, allowing services to send commands without knowing delivery infrastructure
- 🛠️ Minimal onboarding friction for new services and command types
- 🔐 Centralized enforcement of routing and ACL policies
- 📈 Auditable, observable, and replayable command flow
- ❌ No infrastructure provisioning burden on producer or target teams

This system is designed to let new services begin sending or receiving commands by registering logical metadata only—no infrastructure provisioning or EventBridge rule management is required on their part.

## Section B: Architecture Overview

### 1. Message Structure

Messages delivered by Snavio are sent from one _message producer_ (identified by the `source` field of the EventBridge
event) to a single target command queue (identified by the _target_ service and specific `command.name`).

Each message includes the following fields:

```yaml
metadata:
  id: <UUID>
  timestamp: <ISO8601>
  type: snavio.command-sent
  hmac: <HMAC-SHA256 of payload + timestamp + command.name>

command:
  target: <service-name> (e.g. discord-bot)
  name: <command-type>
  payload: <command-payload>
```

#### ⚠️ Security Requirements for Messages

- When delivered to targets, the `command` block will have a `source` field. However, the `command.source` field must **not** be included in producer-sent messages. It wil be populated by the dispatcher based on the sender's IAM-authenticated identity.
- If `command.source` is present, the dispatcher treats the event as malformed and emits a `snavio.command.invalid` failure.
- Messages with invalid or missing HMACs are rejected.

### 2. Producers

    ℹ️ Producers are tenant-owned services which send commands via Snavio.

- All services emit command events to a shared EventBridge Bus (snavio-bus)
- Producers do not reference queue URLs, routing logic, or target details
- Producers use platform APIs to register routes, including ACLs, rate limit settings, dedupe requirements, etc.
- Producers must provision there own IAM roles during onboarding, which will be granted privileges necessary to assume their platform-managed emit role. See Section D for details on IAM policies and tenant isolation.
- Snavio will provision a telemetry delivery queue for each tenant. The platform will deliver messages to these queues as described in Section E - "Observability and Monitoring".

### 3. EventBridge Bus

- One bus for all services: `snavio-command-bus`
- Each tenant assumes a platform-owned IAM role to publish to the bus. See Section D for details on IAM policies and tenant isolation.
- EventBridge enforces producer identity via IAM conditions on events:source
- A single rule matches all `snavio.command-sent` events and forwards to the central Dispatcher Lambda
- Archive + Replay enabled for diagnostics and recovery

### 4. Central Dispatcher Lambda

    ℹ️ Enables dynamic routing and ACL enforcement without static EventBridge rules. This allows zero-touch service onboarding and centralized governance.

The primary responsibilities of the dispatcher are to provide command validation and routing:

- Validate message structure and metadata
- Enforce security controls:
  - Rejects messages with a `command.source` field; adds one based on verified sender Principal.
  - Validates HMAC using a per-service key retrieved at cold start and cached in memory.
  - Enforces a replay window: message timestamp must be within ±60 seconds (configurable per environment).
  - Enforces ACLs on (source, command.name, target) triplets.
- Applies rate limits and fairness policies.
- Route messages to designated target:
  - Resolves destination SQS queue via a DynamoDB-based routing registry.
  - Forwards validated commands to the resolved SQS queue.
- Emits result and telemetry data as described in Section E - "Observability and Monitoring".

See "Section C" for a breakdown of key features of the dispatcher lambda.

### 5. Target Services

    ℹ️ A target service provides one or more command queues to which commands may be routed. Snavio routes messages to these queues based on the (target, command.name) tuple in the mssage.

Routing registration is declarative, and provided by the target service via UI or registration API. Routes are not infra-managed.

Target teams:

- Do not write EventBridge rules or manage dispatcher logic
- Own queues and the consumers for their queues
  - All queues must be SQS Standard (FIFO not supported)
  - Server-side encryption (SSE) via KMS is required
  - Each queue must be registered with an associated DLQ
  - Tenant is responsible for DLQ draining and poison message handling
- Must grant specific permissions to Snavio platform roles
  - Designated snavio dispatcher role must have IAM permission to send messages to queues
  - Designated snavi-monitor role must have IAM permission to inspect queues via `GetQueueAttributes`
- A tenant-specific telemetry delivery queue for each tenant. The platform will deliver messages to these queues as described in Section E - "Observability and Monitoring".
  - Tenants are responsible for responding to telemetry and alerts delivered by the platform as described in that section.

#### ⚠️ Non-support for FIFO Queues

    NOTE: FIFO SQS queues are not supported. Commands must be designed to tolerate reordering and retries. If ordering is critical, implement domain-level sequencing in your target service.

    Snavio strict-mode deduplication provides higher throughput, lower latency, and better fan-out/auditability than SQS FIFO queues, while giving equivalent write-once guarantees for idempotent operations. Ordering guarantees are not provided for messages delivered by Snavio.

#### Target Queue Requirements

Each route must include an `expected_drain_seconds` value indicating the typical time for message consumption. This supports queue health monitoring. Default is 300s if not specified.

⚠️ Platform monitor Lambda regularly inspects all registered queues using `GetQueueAttributes`. It emits metrics and raises alerts based on the following:

- If `ApproximateAgeOfOldestMessage` exceeds 2x `expected_drain_seconds`, the route is marked as unhealthy and alerts are triggered.
- If message depth increases consistently or no messages are ever in-flight, the queue is considered stalled or unpolled.
- These metrics are published to CloudWatch and used to track route health without requiring cooperation from the target.

## Section C: Dispatcher Lambda Details

    🛠️ TODO: Flowchart showing dispatcher behavior

### 1. Triple Dispatch Architecture (Shield -> Fast -> Slow)

While a single conceptual component the _dispatcher_ is really a set of three lambdas:

- A _Shield_ lambda, responsible for failing fast and emitting telemetry for invalid messages, banned tenants, etc.
- A _Fast_ lambda (aka _warm dispatcher_) which performs dispatching without any synchronous coordination whenever possible.
- A _Slow_ lambda (aka _cold dispatcher_) which performs dispatching when coordination (cache refreshes, rate limit checks, etc.) are required

All messages are first routed through the shield lambda and hit the fast lambda if they are valid. They are then either dispatched
directly to the target, or forwarded to the slow lambda for further processing.

### 2. In-Memory Caching:

    ℹ️ The dispatcher loads data necessary for operation from persistent storage at cold start. This data is retained in-memory and used across invocations. Periodic refreshes based on TTLs are performed asynchronously as needed. The Shield Lambda and Fast lambda do not make per-request DynamoDB or SSM calls once warm.

#### Data Cached by the Dispatcher

    🛠️ TODO: Calculate estimated size of cached data

The dispatcher lambda preloads and caches the following data:

- Full routing registry:
  - Map of (target, command) => target queue ARNs
  - Additional target configuration necessary for dispatch, such as `dedupe_mode`
- Full registry of (source, target, command) ACLs
- Full HMAC keyset for all registered produces

#### Cold Start Behavior

Upon cold start, the dispatcher attempts to preload cache data via a snapshot in S3 (see "Cold Start Cache Preloading via S3 Snapshots", below). However, the cache may be loaded directly from DynamoDB as a fallback in the following situations:

- S3 preloading is disabled via platform configuration
- The snapshot is unavailable, expired, or otherwise invalid as described in the relevant section below

#### Stale-Tolerant Cache Model

To ensure consistency and resilience without sacrificing performance, the dispatcher uses a stale-tolerant cache model:

- A `fresh_ttl` (e.g. 60s) and `stale_ttl` (e.g. 180s) are configured independently by cache type (e.g., routing, ACLs, HMACs), but ACL TTLs are additionally overridden by per-command sensitivity profiles when available.
  - TTLs are configurable at the platform level
  - A slight jitter is applied to TTLs to avoid refresh dogpiling.
- If cache age is < `fresh_ttl` seconds, the cache is used without refresh.
- If cache age is > `fresh_ttl` seconds, but < `stale_ttl` seconds, the cache is still used for dispatch, but a background refresh is triggered post-dispatch.
- If cache age is greater than `stale_ttl` seconds, refresh is performed before dispatch proceeds.

#### 🔐 ACL Refresh Policy

    ⚖️ Note: The cache refresh model balances performance with strict TTL enforcement. However, revocation latency is bounded by TTL precision. To eliminate post-revocation access entirely, use critical TTLs and consider pre-dispatch synchronous ACL fetches for ultra-sensitive flows.

ACLs follow a strict pre-dispatch validation model, but stale entries may be tolerated within narrowly bounded TTLs:

- ACL entries are always evaluated before dispatch.
- If an ACL is fresh (age < `fresh_ttl`), it is used as-is.
- If an ACL is within a stale-but-not-expired window (e.g. `fresh_ttl` < age < `stale_ttl`), the dispatcher:
  - Uses it for this dispatch,
  - Triggers a background refresh immediately after,
- Usage of stale-but-not-expired data is reported via the following internal metrics:
  - Snavio.Cache.Usage.Fresh
  - Snavio.Cache.Usage.Stale
  - Snavio.Cache.Usage.Expired
- If the ACL is expired (age > `stale_ttl`), the dispatcher blocks dispatch until the ACL is revalidated synchronously.

ACL TTLs are configurable by sensitivity profile, which are provided by the target service upon command registration:

| Profile  | TTL (x, y)      | Example Commands            |
| -------- | --------------- | --------------------------- |
| critical | 5s (2s, 4s)     | delete-user, revoke-token   |
| moderate | 30s (10s, 20s)  | update-profile, notify-user |
| low      | 120s (30s, 90s) | metrics-upload, ping-check  |

#### 🛡️ ACL Revocation Handling

If an ACL is used during the stale-but-not-expired window, and later found to have been revoked:

- The system emits an audit event: `snavio.command.executed_after_acl_revoked`, as described in Section E: "Observability and Monitoring".
- This event includes the operation, timestamp, and identity involved, enabling downstream alerting and investigation.

#### 📊 Cache Usage Telemetry

    Stale cache usage is expected and normal in a stale-tolerant cache model. These metrics do not indicate a failure; they provide visibility into cache lifecycle behavior across the dispatcher fleet.

High rates of stale usage, especially approaching the stale_ttl, may indicate tuning or refresh issues. In order to track
system performance and preemptively identify potential tuning issues, the dispatcher emits the following internal metrics:

- Snavio.Cache.ACL.Usage.Stale
- Snavio.Cache.Routing.Usage.Stale
- Snavio.Cache.HMAC.Usage.Stale
- Snavio.Cache.ACL.RefreshDuration
- Snavio.Cache.Routing.RefreshDuration
- Snavio.Cache.HMAC.RefreshDuration
- Snavio.Cache.ACL.StaleWindowSeconds
- Snavio.Cache.Routing.StaleWindowSeconds
- Snavio.Cache.HMAC.StaleWindowSeconds

In addition. whenever a cache is refreshed an internal telemetry event is generated:

```json
{
  "cache_type": "ACL",
  "age_seconds": 74,
  "fresh_ttl": 60,
  "stale_ttl": 180
}
```

### 3. Cold Start Cache Preloading via S3 Snapshots

    ℹ️ Snapshot generation is an internal optimization. It reduces cold start latency and protects against DynamoDB overload, but is not required for steady-state dispatch correctness.

    🛠️ TODO: Once DDB query structure is finalized, we should see if we can optimize "critical path" cache loads for first dispatch on cold start

To minimize startup latency and avoid DynamoDB contention during large-scale scale-outs (e.g., cold start bursts, regional failover, or provisioned concurrency ramp-ups), the dispatcher preloads registry data from S3 snapshots. Rather than retrieving routing, ACL, or HMAC data via hundreds of point reads from DynamoDB at cold start, the dispatcher downloads a single, versioned JSON snapshot from S3. This snapshot is parsed into memory and used as the initial state for all dispatch-time cache lookups.

#### Snapshot Structure

- Each snapshot file includes:
  - Full routing registry: (target, command) → queue ARN + metadata
  - ACL registry: (source, target, command) → allow + TTL
  - HMAC keyset: service → active key versions
- Snapshots are stored at well-known paths in a dedicated S3 bucket (configurable at platform level), with following defaults:
  - /snavio/registry/acl/latest.json
  - /snavio/registry/hmac/latest.json
  - /snavio/registry/snapshot/latest.json
- Each file includes an embedded version_id, generated_at, and ttl_policy section for internal consistency checking and TTL tuning.

#### Cold Start Behavior

At cold start, the dispatcher:

- Attempts to fetch the latest snapshot from S3
- Parses and loads the snapshot into in-memory caches
- Falls back to a full DynamoDB cold load if the snapshot is unavailable, malformed, or expired
  - A metric (Snavio.Cache.SnapshotLoadFailure) is emitted

Dispatcher instances track the age of the snapshot (generated_at vs current time) and treat it as fresh for the duration of the configured stale_ttl. Once expired, standard TTL-based refresh logic applies (see “Stale-Tolerant Cache Model”).

#### Snapshot Generation

Snapshots are rotated regularly by a platform-owned `snapshot-generation` lambda:

- Snapshot generation runs on a schedule (30-60s, configurable at the platform level)
- Upon invocation, creates snapshot from data in DDB
- Performs identical validation as dispatcher lambda does during DDB-based cold start
  - Identical validation enforced via use of shared code library or module
- Verifies total snapshot size is below a maximum configured at the platform level
  - Prevents excessive cold start latency and risk of lambda OOM
  - If snapshot is too large, emits a `navio.snapshot.too_large` event and does not update
- Adds metadata and writes to S3 as described in "Snapshot Structure"
- Snapshots are updated atomically using two-phase publish to avoid loading partially-available snapshots
- Emits telemetry:
  - Snavio.Snapshot.Generated
  - Snavio.Snapshot.SizeBytes
  - Snavio.Snapshot.WriteDuration
  - Alerts on validation or publish failures

#### 🔐 Snapshot Security Controls

    The snapshot ingestion path is a critical exploitation vector as it contains critical security configuration such as ACLs and HMAC keys. Assume the dispatcher cache can and will be targeted by adversaries.

**Tamper Prevention**

signing, etc. -- TBD

**💥 Fail-safe Ingestion of Corrupted Snapshots**

do not crash if json is invalid.. validate and guard aggressively

**🛡️ Access Control**

- Only dispatcher Lambdas and platform operators can read from the snapshot path
- Write permissions are strictly limited to the snapshot-writer role

### 🚦 Distributed Rate Limiting (Pre-Dispatch Guarantee)

    A two-tier (Warm + Cold) execution model ensures enforcement with minimal latency impact. Rate limits are enforced per (target, command.name), to improve warm-path and prefetched token utilization.

#### Fast Dispatcher (Low-latency):

- Uses a single in-memory prefetched token per (target, command.name) to perform immediate dispatch.
- If no token is available, the request is forwarded to the Cold Dispatcher.
- Asynchronously prefetches future tokens in a coordinated fashion (see "Stampede Protection (Token Prefetch Coordination)" section below).
- Never guesses token state — only dispatches when a valid, unexpired token is present.
- Tokens are short-lived (e.g., 30–60s TTL) and not shared across containers.

#### Slow Dispatcher (Authoritative):

- Performs DynamoDB conditional writes to enforce quota for (target, command.name).
- Dispatch proceeds only if capacity is available.
- Never performs prefetching.
- Never relies on memory state or speculative execution.

#### Adaptive Fairness Enforcement:

    Rate enforcement is centralized on the target-command pair, enabling better warm token utilization under bursty workloads. By default, source fairness is enforced only when multiple sources compete, preventing false positives during quiet periods or single-sender traffic spikes.

🛑 Local Warm-Path Bans

To prevent a single producer from monopolizing warm-path dispatches under contention, the dispatcher tracks short-lived, in-memory token usage stats per (target, command.name). Penalties are only applied if both:

- The source has consumed a dominant share of warm dispatches (e.g., >80%) within the window
- Other sources have generated a meaningful share of traffic (e.g., ≥10% of usage or N+ competing sources present)

If both conditions are met, the dominant source is temporarily excluded from warm-path token use. This ensures:

- Quiet periods are not penalized
- Warm token reuse is still prioritized
- Contention is handled fairly and locally

Configurable Per-Command

    ❗ The parameters for detecting contention (minmimum "dominant share" percentage, "meaningful share" percentage, etc.) are configurable as part of a command route's metadata. This allows consumers to determine how much (if at all) they prioritize fairness vs. simply saturating their limit

🛑 Durable Global Ban for Repeat Offenders

- A ban count keyed by (source, target, command) is kept in DynamoDB
- If "N" warm-path bans occur in "M" minutes, ban is escalated to a global ban (configurable at the dispatcher level)
- Global bans have extended duration (~5-15 minutes, configurable at the dispatcher level)
- Ban list is retrieved by the dispatcher during cold start and when it's cache TTL is expired, and is checked before dispatching via warm path. Ban list is not queried live.
- Ban list updates are done by cold-path lambda, and have low write frequency due to ban threshold
- Additionally, this table can contain a list of sources which have been set to "cold-only mode" via denylist

#### Optional Per-Source Quotas

Abusive producers may be subjected to an additional per-source quota. The per-source
quota is only evaluated on the cold path and only for requests which have been subject
to a warm path ban (to avoid additional cost/latency for all requests which are on cold path for other reasons such as cache miss).

🧩 Lookup Flow:

- Retrieve "source quota" value for (source, target, command) triplet
- If none is set, proceed as normal
- If quota exists, perform conditional write to increment rate counter table
- Reject dispatch if token is not available. Emits a failure event with `rate-limit-exceeded: source-quota`

#### Other properties:

🛡️ Stampede Protection (Token Prefetch Coordination):

Token prefetching is gated via a DynamoDB-backed coordination mechanism. For each (target, command.name) and 1-second time slot, up to N containers (default: 5) are allowed to prefetch tokens.

- Containers attempt to acquire a lease in DynamoDB via conditional write to a per-slot coordination key. Only if the number of leaseholders is below the configured maximum does the container proceed with prefetching.
- Coordination keys are auto-expiring via TTL to avoid buildup. This ensures that token prefetch pressure is globally bounded, even during heavy autoscaling or cold start events.
- The per-slot limit (N) is configurable at the dispatcher level and may be tuned per (target, command) if needed.

🧠 Adaptive Mode:

- The dispatcher supports a snavio_dispatch_mode flag (cold-only | adaptive) to control dispatch behavior:
  - cold-only: All requests cold-path for strict enforcement.
  - adaptive (default): Enables warm token usage with fairness and abuse detection layers.

#### Summary:

- Warm Dispatcher improves latency and platform cost only when it’s safe to do so.
- Cold Dispatcher guarantees quota correctness and deterministic enforcement.
- Adaptive fairness ensures that warm-path optimizations do not degrade service equity across producers.
- Together, they ensure strict quota adherence without performance penalties for hot paths.

### 📈 Rate Limiting Observability

#### Denial Stats and Shadow Fairness Tracking:

To improvement observability and support future rate shaping and abuse protection, the dispatcher tracks both hard rejections and warm-path dominance:

⏱️ Local Fairness Stats:

- Each container tracks token usage per (target, command.name) across all sources.
- If a single source dominates usage and other sources are actively dispatching:
  - That source is locally warm-path denied for a short duration (e.g., 30s).
  - Emits events when warm path access denied: `snavio.fairness.warm-path-ban`
- Counters are reset every 30s to allow dynamic recovery.
- **No penalties are applied if no meaningful contention is observed.**

📊 Global Rollups:

- Containers periodically push source-wise dispatch stats to a DDB-backed aggregation store every 60s.
- A centralized fairness auditor lambda runs on a schedule (every 1–2 minutes) and aggregates per-source dispatch share stats.
- Flags sources that exceed a X% dominance threshold across single targets or Y% across multiple targets.
- Emits `snavio.fairness.abuse_detected` and updates global warm-ban list. (See the "Durable Global Ban for Repeat Offenders" section above.)

💬 Structured Fairness Feedback:

When snavio.command.failed is emitted for fairness-related issues, the event includes structured diagnostics:

```json
{
  "reason": "fairness-violation",
  "retry_after_ms": 30000,
  "throttle_until": "2025-04-07T15:12:00Z",
  "source_share": 0.91,
  "competing_share": 0.12,
  "dispatch_volume": 60
}
```

This provides transparency and clear auditability for enforcement actions.

🛑 Hard Rejection on Sustained Abuse:

If a source continues to dominate despite warm-path denial and the target’s quota is saturated, the dispatcher escalates to outright rejection.

- All hard rejections include structured failure events and metrics for visibility.

💬 Backoff Hints in Failure Events:

When emitting snavio.command.failed (reason: rate-limit-exceeded), the dispatcher includes structured retry hints:

```json
{
  "retry_after_ms": 30000,
  "throttle_until": "2025-04-07T15:12:00Z"
}
```

- `retry_after_ms` indicates the minimum backoff duration the producer should wait before retrying the same command.
- `throttle_until` provides an absolute timestamp when the command will likely be accepted again, useful for human-readable logs or dashboards.
- These hints are informational only and **not enforced by the dispatcher**.
- Savvy producer teams may optionally use this metadata to pause retries, dampen retries, or trigger alert suppression.

### 🧩 Deduplication Model: Optional Write-Once Enforcement

    By default, Snavio guarantees at-least-once command delivery. However, for commands requiring stricter guarantees, Snavio supports an optional deduplication mode that ensures write-once semantics across all dispatchers with zero impact on latency for non-strict traffic.

Each target route (target, command pair) may opt in to deduplication by setting a `dedupe_mode: strict` flag when the route is registered.

Commands dispatched to targets marked with `dedupe_mode: strict` are subject to global write-once enforcement using DynamoDB as the coordination store. Commands dispatched to targets without this field, or with `dedupe_mode: none`, follow the fast at-least-once path and may be delivered multiple times under retry, replay, or failure scenarios.

### 🚦 Two-Tier Deduplication Architecture

    To support opt-in deduplication without penalizing fast-path performance, Snavio introduces a tiered dispatcher model.

#### ⚡ Fast Lambda (Latency-Optimized Path)

- Performs immediate dispatch using only in-memory resources (prefetched tokens, cached routes, ACLs)
- Makes no external calls (DynamoDB, Secrets Manager, etc.)

For strict-mode commands:

- If the command has been seen in the current container’s in-memory cache, it is dropped as a duplicate and snavio.command.duplicate is emitted
- If not seen, the command is forwarded asynchronously to the Slow Lambda for deduplication and potential dispatch

#### 🐢 Slow Lambda (Coordination-Enabled Path)

- Handles deduplication, cache misses, and token issuance

For strict-mode commands:

- Performs a conditional write to DynamoDB using the command_id as key with attribute_not_exists to enforce single-use
- If the write fails, emits snavio.command.duplicate and does not dispatch
- If the write succeeds, validates the command (ACLs, rate limits) and dispatches
- Dispatch latency may be significantly higher than "Fast Lambda" due to coordination

Only invoked for escalated requests, minimizing cost and concurrency pressure

#### 🧠 Deduplication Configuration

- `dedupe_mode`:
  - none (default): at-least-once, fastest path
  - dedupe_mode: strict: write-once enforcement, slower path
- command_id is mandatory for strict deduplication
- command_id must be globally unique for the duration of the deduplication TTL (default: 5 minutes)

#### 🔐 Deduplication TTL and Replay Behavior

- Deduplication records are stored in DynamoDB with TTL (~300s)
- Commands replayed after TTL expiration are considered valid and may be reprocessed.

#### 🧰 Fast Lambda Escalation Behavior

Fast Lambdas forward commands to the Slow Lambda when any of the following conditions are met:

- Deduplication required but command not cached locally
- Rate token not available in memory
- ACL entry is expired or missing
- Routing cache is stale beyond permitted threshold

Fast Lambdas emit structured telemetry for all escalations, including reason codes (cache_miss, dedupe_required, token_required, etc.)

#### 📉 Deduplication Metrics and Monitoring

Platform metrics include:

- `Snavio.Dedup.StrictModeUsage` – rate of commands using strict deduplication
- `Snavio.Dedup.DuplicatesPrevented` – dedupes caught in Fast or Slow path
- `Snavio.Dedup.Escalations` – count of forwarded strict-mode commands to Slow Lambda
- `Snavio.Dedup.SlowPathLatency` – p50/p95 latency for dedupe-enabled commands

#### 🔧 Developer Guidance

    Use dedupe_mode: strict only for commands where duplicate delivery would cause side effects (e.g., delete-user, refund, revoke-access)

    Use UUIDv4 for command_id; ensure the same ID is reused across retries for deduplication to take effect

#### ✅ Summary

This model ensures deduplication guarantees are available where needed without degrading system-wide latency or throughput. The dispatcher design cleanly separates fast, non-coordinated paths from slower, correctness-enforced paths—allowing teams to balance latency, cost, and delivery semantics based on their specific use case.

### Failure Feedback Loop

- Failed command sends emit snavio.command.failed events
- Producers can subscribe to failures scoped to their own service name (command.source)
- Enables alerting, logging, or retry by sender teams

### 🔐 Security Controls

- IAM conditions validate producer identity (events:source == service tag)
  - The EventBridge bus policy restricts which principals can emit events
- Dispatcher enforces:
  - That command.source is _not_ present in producer payloads
  - That actual command.source is assigned from authenticated event.source
  - That the message HMAC is present and valid using per-service shared secret
  - ACLs for legal (source, command, target) pairs
  - ACL entries include TTLs or sensitivity tags that dictate staleness tolerance

#### 🔑 HMAC Key Management and Enforcement

For producer clients:

- Each producer is assigned a unique HMAC secret used to sign messages.
- Secrets are centrally stored and managed by the platform—producers are not required to use SSM, Secrets Manager, or any infrastructure to retrieve them.
- HMAC secrets are versioned (e.g., hmac-v1, hmac-v2) and rotated on a regular cadence (e.g., every 30 days).
- Producers include a version_id in each message indicating the key used to compute the HMAC.
- The dispatcher validates HMACs using cached key versions, and accepts both the current and immediately previous version during a defined overlap window (e.g., 7 days).
- Secret versions and expiry timelines are published via the platform’s API (e.g. "/tenant-config"), which all producers are expected to poll periodically (e.g., every 12 hours).
- No secrets are ever. Rotation is client-driven via config polling.

For the dispatcher:

- Dispatcher loads all active key versions at cold start and supports validation against previous versions for a limited grace period.
- Secrets are stored in DynamoDB

Key Rotation Model:

- Rotation is handled centrally by the platform.
- Producers retrieve key metadata (active + previous) via API endpoint
- If a producer continues to use an expired or soon-to-expire key, the dispatcher:
  - Still accepts the message (within grace period),
  - Emits a structured telemetry event (`snavio.secret.legacy_key_used`),
  - Logs the event for audit and observability purposes.
- If a producer has not polled for a rotated key as expected, emit telemetry via a `snavio.secret.key_expiry_imminent` event

This rotation model avoids per-producer IAM config, eliminates drift risk from SSM/Secrets Manager misuse, and keeps rotation logic centralized and observable.

#### Replay Window Enforcement for HMAC

The dispatcher enforces a strict time window policy on incoming messages to prevent replay attacks. The HMAC is only accepted if the embedded timestamp is within a configurable ±60-second window from the current dispatcher time.

This protects against:

- Delayed message replays from compromised producers
- Abuse via logs or dead-letter queue replay
- Timestamp spoofing attacks

The replay window is enforced before HMAC validation. Messages falling outside the window are rejected as invalid, regardless of HMAC correctness.

🕙 Timestamp Correctness

To minimize false rejects due to clock skew, it is critical that message producers properly sync their clock and the
platform notify them if clock skew is detected.

    📄 Integration documentation for clients must highlight that producer system clocks must be synchronized using NTP or equivalent (e.g., Lambda/Fargate -- nothing needed, EC2/ECS/EKS -- ensure NTP is enabled and syncing via 169.254.169.123, custom AMIs/containers -- confirm ntpd/chronyd is active, etc.)

In addition to the general guidance, the following skew-related telemetry is reported:

- `snavio.telemetry.skew_near_limit`: event when effective skew >= 0.8 \* (max_allowed_skew)
- `snavio.command.invalid`: when commands rejected due to invalid HMAC timestamp, include a reason indicating timestamp problem
- `snavio.telemetry.skew_sample`: Emitted at a low frequency (or % of messages) to allow for monitoring and trend analysis

These events are structured, and include the following:

```json
{
  "event": "...",
  "messageId": "...",
  "skew_seconds": 91.4,
  "source": "tenant-b",
  "sent_at": "2025-04-07T12:58:00Z",
  "received_at": "2025-04-07T12:59:31Z"
}
```

## Section D: IAM Architecture and Role Delegation

    This section describes how IAM is structured to support secure, zero-touch, multi-tenant onboarding while preserving strict identity enforcement and platform control.

### 🔐 IAM Enforcement Model

Snavio supports secure, tenant-isolated command emission through a **platform-issued IAM role delegation model**. This ensures:

- 🧍 Producers emit commands _without_ provisioning IAM permissions or EventBridge policies in their own account
- 🛡️ Platform enforces strict `events:source` binding to verified producer identities
- ✨ Tenant onboarding is fully self-service—no human-in-the-loop CI/CD changes required

### 🧱 Core Principle: Centralized Roles, Tenant-Scoped Trust

For each tenant, the platform provisions a **dedicated IAM role** in the platform account:

```
arn:aws:iam::<platform-account>:role/snavio-emit-<tenant-id>
```

This role:

- Has permission to publish to the `snavio-command-bus` EventBridge bus
- Enforces strict conditions on `events:source` values allowed
- Can only be assumed by IAM roles in the tenant’s AWS account (cross-account trust)

Tenants never receive long-term credentials or EventBridge policies. They **assume the platform role using STS** and publish with temporary credentials.

---

### 🔁 Dynamic Role Delegation Flow

1.  Tenant registers a new service (e.g., `account-service`)
2.  The platform:
    - Generates an `events:source = <tenant-id>/account-service` string
    - Updates the tenant’s assigned emit-role with a scoped IAM policy allowing that `events:source`
    - Adds the relevant tenant IAM role ARN (e.g., `BillingSenderRole`) to the trust policy of the emit role
3.  The tenant:
    - Calls `sts:AssumeRole` using their own IAM role
    - Publishes to EventBridge using the returned temporary credentials

---

### ✳️ Sample IAM Policy (Platform-Owned Emit Role)

**Trust Policy:**

```json
{
  "Effect": "Allow",
  "Principal": {
    "AWS": [
      "arn:aws:iam::123456789012:role/BillingSenderRole",
      "arn:aws:iam::123456789012:role/AccountSenderRole"
    ]
  },
  "Action": "sts:AssumeRole"
}
```

**Inline Permission Policy (scoped by identity and source):**

```json
{
  "Effect": "Allow",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:us-east-1:<platform-account>:event-bus/snavio-command-bus",
  "Condition": {
    "StringEquals": {
      "events:source": "123456789012/account-service"
    },
    "StringLike": {
      "aws:userid": "*:AccountSenderRole"
    }
  }
}
```

Multiple source-role mappings can coexist within a single emit role, allowing fine-grained control.

---

### 🔒 Why Not Use Dynamic Bus Policy Updates?

The Snavio EventBridge bus policy is treated as **immutable IaC** to avoid risk:

- ❌ No direct mutation via `PutResourcePolicy`
- ✅ All producer access is mediated via the platform's scoped roles
- ✅ Bus policy allows `PutEvents` from roles matching `arn:aws:iam::<platform>:role/snavio-emit-*`

This approach prevents:

- Policy drift
- Multi-tenant blast radius
- Deployment race conditions or broken onboarding paths

---

### ✅ Summary

| Concern                    | Solution                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| Source spoofing            | IAM condition: `events:source == <tenant-id>/<service-name>`              |
| Onboarding latency         | Roles pre-created, updated dynamically via SDK                            |
| Per-service source scoping | IAM `aws:userid` binding to tenant IAM role                               |
| EventBridge policy sprawl  | Static trust of `snavio-emit-*` roles, no dynamic mutations               |
| Multi-role tenants         | Role-level isolation of allowed `events:source` strings                   |
| Zero producer IAM setup    | Tenant only needs `sts:AssumeRole`, no EventBridge policy config required |

---

This model provides strong multi-tenant isolation, full auditability, and hands-off onboarding—while keeping the Snavio command bus locked down under centralized, reviewable control.

## Section E: Observability and Monitoring

    All sends, failures, and rejections are logged

    CloudWatch metrics cover:

        Volume of commands by type and target

        Failed dispatches

        Unauthorized or misrouted commands

        HMAC verification failures

    Each target queue supports optional DLQ for poison message handling (required)

    🔎 **Route Health Visibility:**

        - Missing routes for incoming commands are logged and metered
        - Registered routes with no reachable queue or inactive consumer are flagged
        - Commands sent with no registration match are treated as misroutes

### 🚨 Alert Delivery Model

    To support timely, actionable notifications for high-signal telemetry conditions, the platform offers an out-of-band alert delivery mechanism.

Alerts are distinct from standard telemetry and are not delivered via the tenant's primary telemetry delivery channel(s).

#### Alert Channels and Purpose

Alerts are used to notify tenants of urgent, high-priority operational issues, including but not limited to:

- Persistent unconsumed telemetry queues
- Message age-outs or DLQ overflow
- Repeated invalid commands or protocol violations
- Fairness violations, warm-path bans, or security issues

Alerts are delivered to tenant-configured channels and are not dependent on standard telemetry consumption.

#### Supported Alert Channels

Tenants may register one or more alert delivery mechanisms via the platform registration API. For each alert-enabled
event type, the tenant may specify zero-or-more channels to which the alerts should be delivered. The platform will
initially support the following channel types:

- dashboard: Event will be delivered as a dashboard message with notification
- email: Email with structured JSON body and summary subject
- webhook: HTTPS POST with structured alert payload

#### ⚠️ Critical Alerts Cannot Be Disabled

Certain platform-defined events are always delivered via at least one alert channel:

- `snavio.command.invalid`
- `snavio.telemetry.dropped`
- `snavio.secret.key_expiry_imminent`

If no alert channel is configured, these are logged to platform metrics and flagged for follow-up by the operations team. The platform may escalate via ticket, email, or other administrative channels.

This model ensures that even when tenants ignore or misconfigure their primary telemetry ingestion, they still receive high-signal alerts via actionable, out-of-band paths.

### 📬 Telemetry Delivery Model

    To support secure, scalable, and observable telemetry delivery in a multi-tenant PaaS environment, the platform employs a dedicated per-tenant telemetry pipeline using SNS and SQS.

#### 📡 Architecture Overview

Platform Responsibilities:

- The platform provisions a dedicated SNS topic per tenant for telemetry events.
- A dedicated SQS queue per tenant is created and subscribed to the corresponding SNS topic.
- The platform manages all IAM policies and subscriptions, ensuring only the correct tenant can consume their telemetry.
- Tenants are granted read-only access to their own telemetry SQS queue.
- SNS handles delivery retries, fanout logic, and DLQ fallback for delivery robustness and observability.

#### Telemetry Publishing Path

Telemetry emission is handled using a resilient, decoupled outbox pattern:

- The dispatcher does not send telemetry directly.
- Instead, it writes telemetry send records to a DynamoDB telemetry outbox table, including:
  - Target tenant
  - Event payload
  - Event type
  - TTL for expiration
- The telemetry outbox table has DDB Streams enabled.
- A dedicated Outbox Lambda is triggered via stream events.

Outbox Lambda Behavior:

- The Outbox Lambda buffers telemetry records for up to 1 second, or until 10 messages are accumulated.
- Batches of telemetry events are published to the corresponding per-tenant SNS topic.

The Lambda includes logic for:

- Handling SNS Publish failures (retries, alerting on non-retryable errors)
- Batching per tenant
- Emitting platform-side delivery failure telemetry if publishing fails

#### 🔎 Observability and Operations

Per-tenant telemetry SQS queues are actively monitored by the platform:

- ApproximateAgeOfOldestMessage
- ApproximateNumberOfMessagesDelayed
- NumberOfMessagesSent
- NumberOfMessagesDeleted

Growing DLQs, aged messages, or stalled queues trigger alerts to the platform operations team.

If a queue backlog reaches retention limits (e.g., messages age out at 14 days), the platform emits a structured event:

```json
{
  "event": "snavio.telemetry.dropped",
  "tenant": "tenant-xyz",
  "reason": "queue_unconsumed",
  "dropped_events": 1452,
  "queue_age_seconds": 1209600,
  "last_received_at": "2025-04-08T10:32:00Z"
}
```

The platform ops team is responsible for:

- Investigating telemetry delivery failures
- Following up with tenant teams as needed
- Managing retries or replays from DLQ if required
- Telemetry queues are optional to consume, but the platform maintains full visibility into delivery status. Non-consumption is tracked and escalated when appropriate.

Tenants may optionally configure alerts for events related to unconsumed or dropped telemetry (see relevant section on
tenant alerting.)

This architecture ensures high delivery reliability, observability, and zero-infra burden for tenants, while enabling the platform to scale cleanly and enforce strong tenant isolation.

#### Client Requirements

    In order to minimize the technical burden for clients, it is not required that telemetry messages be consumed.

While the system does monitor telemetry queues (queue length, dequeue rate, dlq growth, etc.) there is no direct penalty
for tenants which fail to successful process telemetry. However, tenants are still subject to platform enforcement
actions (such as loss of warm-path access or outright bans) even if the relevant telemetry was never consumed.

While it is recommended that tenants utilize provided SDK tools for automatically consuming and responding to telemetry,
while ramping up the following mechanisms may be sufficient:

- Critical telemetry data is visible to the client via the system dashboard
- Critical telemetry events are delivered as alerts (described above), with default settings falling back to email delivery

### 📊 Telemetry Events

    Snavio emits structured telemetry events to enable auditing, monitoring, failure investigation, abuse detection, and compliance enforcement. The following is a comprehensive catalog of all telemetry event types, grouped by category and annotated with their purpose and structure.

---

#### `snavio.command.delivered`

Emitted when a valid command is successfully dispatched to the target after passing all checks (HMAC, ACL, deduplication, rate limits).

Includes:

- command_id
- source
- target
- command.name
- timestamp
- path: `fast` or `slow`
- dispatch_latency_ms
- replay: true if the command was delivered during a replay operation
- replay_reason: reason given for a reply operation (only if `replay: true`)
- replay_id: id of the replay associated with delivery (only if `replay: true`)

---

#### `snavio.command.invalid`

Emitted when a message fails schema or protocol validation. Includes the following fields, unless the invalid
request did not include them:

- command_id
- source
- target
- command.name
- timestamp

The following fields are always included:

- reason: short code describing the specific violation (`command.source` in payload, missing/invalid HMAC, expired timestamp, etc.)

🚨 These events will trigger an alert, if configured.

---

#### `snavio.command.failed`

Emitted when a message fails to dispatch due to runtime issues, such as ACL deny, rate limit exceeded, missing route, or target delivery failure. All fairness and quota-related failures will emit `snavio.command.failed` with structured payload, plus auxiliary telemetry (warm-path-ban, abuse_detected) when needed. This event is emitted for each failed event, although auxiliary telemetry is only emitted one time per enforcement window.

Includes the following fields, unless the failed request did not include them:

- command_id
- source
- target
- command.name
- timestamp
- reason: `'rate-limit-exceeded'` | `'acl-deny'` | `'route-missing'` | `'delivery-failure'` | `'fairness-violation'`
- replay: true if the command was delivered during a replay operation
- replay_reason: reason given for a reply operation (only if `replay: true`)
- replay_id: id of the replay associated with delivery (only if `replay: true`)

If `rate-limit-exceeded`, the event also includes:

- `retry_after_ms`
- `throttle_until`

---

#### `snavio.command.duplicate`

Emitted when strict-mode deduplication is enabled for a command and the system detects a duplicate `command_id`.

Includes:

- command_id
- source
- target
- command.name
- timestamp
- dedupe_mode: `strict`

---

#### `snavio.command.executed_after_acl_revoked`

Emitted when a command is dispatched using a stale ACL entry that was later revoked.

Includes:

- source
- target
- command.name
- stale_duration_seconds
- acl_revocation_timestamp

🚨 These events will trigger an alert, if configured.

---

#### `snavio.fairness.warm-path-ban`

Emitted when a source is locally banned from warm-path token use due to dominance over other producers on a (target, command) pair. This event is emitted one time per ban window.

Includes:

- source
- target
- command.name
- source_share
- competing_share
- retry_after_ms
- throttle_until

---

#### `snavio.fairness.abuse_detected`

Emitted when a centralized auditor detects recurring warm-path abuse across one or more targets. This event is emitted one time per ban window.

Includes:

- source
- affected_targets
- total_violations
- ban_applied_until

---

#### `snavio.secret.legacy_key_used`

Emitted when a producer uses an older (but still accepted) HMAC secret version during the allowed grace period.

Includes:

- version_id
- source
- time_of_last_config_poll (if known)

---

#### `snavio.secret.key_expiry_imminent`

Emitted when a producer continues using a soon-to-expire key version and has not polled for updates as expected.

Includes:

- version_id
- source
- time_of_last_config_poll (if known)

🚨 These events will trigger an alert, if configured.

---

#### `snavio.telemetry.skew_near_limit`

Emitted when a command’s clock skew approaches the edge of the replay window.

Includes:

- command_id
- source
- sent_at
- received_at
- skew_seconds

---

#### `snavio.telemetry.skew_sample`

Emitted periodically (e.g., 1% of messages) to sample timestamp skew across tenants and environments.

Includes:

- source
- skew_seconds
- sent_at
- received_at

---

#### `snavio.telemetry.dropped`

Emitted when telemetry messages are dropped due to tenant SQS queues aging out or remaining unconsumed.

Includes:

- tenant
- dropped_events
- reason: `'queue_unconsumed'`
- queue_age_seconds
- last_received_at

🚨 These events will trigger an alert, if configured.

## Section F Rationale and Alternatives

❌ Proposed Alternative (EventBridge Pipes per (target, command)):

    Considered creating one EventBridge Pipe per (target, command.name)

    Rejected due to unscalable infrastructure sprawl (pipes do not support EventBridge as a source)

    Also failed to support dynamic command addition or centralized error handling

❌ Static Routing via EventBridge Rules

    Considered using static EventBridge rules for routing (e.g., detail.command.target == X)

    Rejected due to:

        Operational sprawl of rule proliferation

        Tight quotas on EventBridge rules (500 per bus, per region)

        No runtime mutability (teams would require IaC PRs to onboard)

        No audit trail unless paired with IaC (which defeats the purpose of simplicity)

        No centralized ACL enforcement

    🔥 Dynamic routing via dispatcher Lambda allows runtime mutability, self-service registration, and central governance with far less operational overhead.

❌ Push-based Cache Invalidation

    Push-based cache invalidation (e.g. via snavio.registry.updated events) was intentionally omitted from the platform.

    In a horizontally scaled Lambda fleet, such messages only reach a small subset of containers, and do not guarantee cache coherence. They create operational confusion and false assurance of consistency without solving the underlying problem.

    Instead, cache refreshes are handled via:

        Stale-tolerant TTL windows, which ensure bounded inconsistency

        Periodic refresh with jitter, to avoid refresh stampedes

        Cold-path fallback, for correctness under expiration

    If absolute cache freshness is required (e.g. security-critical ACL revocation), configure TTLs appropriately or enforce pre-dispatch synchronous fetches for that command profile.

❌ Federated Dispatcher Per Target

    Explored per-target dispatchers or EventBridge Pipes

    Rejected due to:

        Duplicated logic across services

        No central error feedback path to producers

        Offloading routing onto service teams

        Harder to enforce global ACLs or track violations

        Too brittle for high team count and growing command graph

✅ Final Model Justification

The chosen architecture supports:

    Dynamic routing, via dispatcher lookups in a registry

    Central ACL enforcement, for safe service-to-service communication

    Service onboarding with no infra, through data registration only

    Auditability and rollback, via central routing registry

    Scalable governance, with a single platform-owned control plane

❌ Rejected Rate Limiting Strategies:

    Fully accurate per-call rate limit with Redis or ElastiCache:

        Rejected due to infrastructure complexity, VPC dependency, and Redis being out-of-scope for MVP.

        Requires persistent connection management and distributed state sync.

    In-memory only token bucket per container:

        Rejected due to lack of cross-instance coordination. Dispatcher scale-out means rate limits would be violated across cold-started Lambdas.

        No global enforcement or protection under burst.

    Synchronous DDB rate counter check per request:

        Rejected due to unacceptable hot path latency and potential for DynamoDB throttling.

        Equivalent to full registry revalidation; violates no-DDB-on-hot-path rule.

✅ Final Approach (Accepted): Post-dispatch check with local denylist:

    - Ensures low-latency dispatch while retaining distributed enforcement capability.
    - Denylists triggered by DDB post-checks contain (source, command) pairs for short durations per Lambda container.
    - Slight overrun allowed per container, acceptable for operational tolerances.

Appendix A: Implementation Details (for Engineering Teams)

These components ensure long-term maintainability and resilience:

✅ Routing Registry

    Stored in DynamoDB

    Keys: (target, command.name)

    Values: destination SQS ARN, version, metadata

    TTL optional for ephemeral routes

    Stream-backed audit logging (optional)

✅ ACL Registry

    Table or attribute map: (source, command.name, target)

    Each entry may include TTL or sensitivity profile ("critical", "moderate", "low")

    Enforced centrally by dispatcher

    Exported as versioned snapshots to S3

✅ Registration Flow

    Internal CLI or tool for register-target

        Validates format

        Performs dry-run test routing

        Records changelog

    No PRs or IaC changes required

✅ Dispatcher Hardening

    Provisioned concurrency enabled to eliminate cold starts

    Alarmed on p95 latency, error rate, throttles

    Retry policies + DLQ for failed events

    Unit tests for all routing and ACL cases

✅ Cost/Latency Analysis (available in internal perf report)

    Average latency (end-to-end): < 150ms

    Dispatcher Lambda cost per 1M commands: ~<$10

    EventBridge archive cost: ~$0.10/GB/month

    Registry lookup latency: < 10ms p95 (DDB)

✅ Rate Limit Registry

    Stored in DynamoDB or config service

    Keys: (source, command.name) or (target, command.name)

    Values: max requests per interval, burst capacity, optional cooldowns

    Entries can also be tied to sensitivity profiles ("critical", "moderate", "low")

    Dispatcher enforces limits via post-dispatch background checks

    Excess usage triggers local denylist and emits snavio.command.failed (reason: rate-limit-exceeded)

    Platform teams monitor and adjust limits over time based on volume trends

    Optional: Shadow mode operation for observability before full enforcement

📌 Appendix B: Stale-Tolerant Cache Pattern (Dispatcher Lambda)

To balance dispatch latency with routing consistency, the dispatcher implements a three-phase cache lifecycle:

🔁 Cache Lifecycle

Phase Cache Age Behavior
Fresh < X seconds Use cache without refresh
Stale X ≤ age < Y seconds Dispatch using cache, then refresh it
Expired ≥ Y seconds Refresh cache first, then dispatch

    Typical values: X = 300s, Y = 600s, with a small jitter added to stagger refreshes across containers.

    Refresh is idempotent, fast, and isolated to a single container.

    If a registry update is received via snavio.registry.updated, the cache is refreshed immediately, regardless of age.

🧐 Lambda Implementation Notes

    Registry metadata (e.g., loaded_at, version_id) is stored in the container’s global scope.

    During invocation:

        Age is calculated once.

        State machine (fresh, stale, expired) determines handling.

    In stale phase:

        Dispatcher completes the message forwarding first.

        Cache is refreshed after dispatch, without blocking the hot path.

        Refresh failures are logged but do not impact current invocation.

This model ensures high cache hit rates, avoids DynamoDB overload, and prevents latency spikes during routine traffic—all while maintaining near-real-time registry coherence.

� Appendix C: Operational Replay Guidance

Snavio supports command replay for diagnostics, recovery, and manual intervention. Replay handling must balance operational convenience with strong integrity and security guarantees.

🛠️ **2. Platform-Owned Replay Tool (Planned)**

- A new tool (`snavio-replayer`) will be introduced for controlled, auditable replay of archived or dead-lettered commands.
- Capabilities:
  - Pull archived commands from EventBridge or DLQ
  - Update `timestamp` to current time
  - Recompute `hmac` using platform-owned per-service key
  - Emit a new, fully valid message with optional metadata (e.g., `replayed: true`, `replay_reason`, `replay_id`)
- Messages are indistinguishable from normal live traffic, but fully compliant with all enforcement layers (HMAC, timestamp, ACL, rate limits)
- No separate snavio.command.replayed event is emitted. All replayed messages are tracked via embedded fields in existing telemetry types.
- ✅ Recommended for all production replays

🔐 **Security Notes:**

- The platform owns HMAC secrets and is authorized to re-sign messages.
- All replays must be logged with metadata including origin, reason, and operator identity.
- The replay tool is privileged and should be tightly scoped via IAM.

📈 Benefits of Custom Replay Tool:

- Strong audit trail
- Fresh timestamps and signatures
- No special-case dispatcher behavior
- Safe for COTS/multi-tenant deployments
