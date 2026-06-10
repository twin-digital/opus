# Grinbox pipeline runtime

How the Daemon actually runs Pipelines. Covers the execution
loop, failure handling, timeout enforcement, Provider polling,
Contract validation lifecycle, and Daemon lifecycle.

Depends on [architecture.md](architecture.md) for the system
shape, [data-model.md](data-model.md) for the State DB tables
this document operates on, and [glossary.md](glossary.md) for
vocabulary.

---

## Process model

The Daemon is a single Node process with two conceptual loops
and an HTTP server, all sharing one SQLite connection (WAL mode):

| Loop               | What it does                                                                          | Cadence                                         |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Poll loop**      | For each Account with an `active_pipeline_id`, fetch new Messages and enqueue Triages | Per-Account poll interval (default 600s)        |
| **Execution loop** | Pull ready `triage_operator_runs` rows, dispatch to workers                           | Continuously (sleep 150ms when nothing's ready) |
| **HTTP server**    | UI / CLI API                                                                          | On request                                      |

Coordination is entirely through the State DB. No in-memory
per-Triage state outlives a worker invocation.

---

## Triage lifecycle

### Creation (enqueue)

Triggered by the poll loop (live), the HTTP server (replay), or
a future scheduled-replay loop.

Single transaction:

1. INSERT `triages` row (`status='running'`, `pipeline_id`,
   `triggered_by`)
2. For each enabled Operator in the Pipeline:
   INSERT a `triage_operator_runs` row snapshotting the
   Operator's current `type_key`, `type_code_version`, and
   `config_json` into the row's `op_config_json` column;
   `status='pending'`, `created_at=now`

The snapshot is captured at enqueue, not at run-start —
in-flight Triages are insulated from concurrent Operator edits.
After commit, the Triage is enqueued.

### Tag scoping during a Triage

Every Triage has its own Tag set, stored in `tags` keyed
`(triage_id, key)`. Tags from one Triage are never visible to
another Triage:

- During a Triage T, downstream Operators read inputs from
  `tags WHERE triage_id = T` (and from the raw Message fields,
  always available).
- Replay Triages start with empty Tag state — every Operator
  evaluates from scratch.

The "current Tags on a Message" the User sees in the UI = the
output of the latest-started, settled Triage for that
`(message, pipeline)`, looked up via the `current_triages`
cache. Always one Triage's outputs in full, never a mix.

### Settlement

A Triage settles when all its `triage_operator_runs` rows are
terminal (`completed`, `failed`, or `skipped`). The worker that
completes the _last_ non-terminal run handles settlement:

```sql
SELECT COUNT(*) FROM triage_operator_runs
WHERE triage_id = ?
  AND status IN ('pending', 'running')
```

If zero: derive Triage status and UPDATE:

| Condition                                                                        | `triages.status` |
| -------------------------------------------------------------------------------- | ---------------- |
| All `completed`                                                                  | `completed`      |
| Any `failed` or `skipped` (a producer failed and its dependents cascade-skipped) | `partial`        |
| Loop itself errored (rare; set by the loop, not derived from run states)         | `failed`         |

Status is derived by `deriveTriageStatus(runs)`, which returns only
`completed` or `partial`. `failed` is reserved for a loop-level error
that prevents normal settlement and is set by the caller — never
derived from the run states. An all-`skipped` Triage (reachable only
when the producing Operators themselves failed or were skipped)
settles `partial`: the absence of any clean output is not a complete
run.

Then UPSERT `current_triages` for `(message_id, pipeline_id)` if
this Triage's `started_at` is later than the existing row's
(handles interleaved-Triage ordering).

---

## Execution loop

Pseudocode of the loop body:

```js
async function executionLoopTick() {
  const slots = workerPool.availableSlots()
  if (slots === 0) {
    await sleep(150)
    return
  }

  const candidates = db
    .prepare(
      `
    SELECT * FROM triage_operator_runs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 50
  `,
    )
    .all()

  let dispatched = 0
  for (const row of candidates) {
    if (dispatched >= slots) break
    const inputStatus = classifyInputs(row)
    if (inputStatus === 'satisfied') {
      const result = claim(row.triage_id, row.operator_id)
      if (result.changes === 1) {
        workerPool.dispatch(row)
        dispatched++
      }
    } else if (inputStatus === 'definitively_missing') {
      markSkipped(row.triage_id, row.operator_id, inputStatus.reason)
      // markSkipped's transaction includes the settlement check,
      // same pattern as persistOperatorResult.
    }
    // else: leave pending, retry next tick
  }

  if (dispatched === 0) await sleep(150)
}
```

### Optimistic claim

```sql
UPDATE triage_operator_runs
SET status = 'running', started_at = ?
WHERE triage_id = ? AND operator_id = ? AND status = 'pending'
```

Check `changes === 1` to confirm. In a single-process Daemon the
claim is atomic via JS's event loop, but the WHERE-clause guard
is cheap insurance against future multi-process scenarios and
bug paths that bypass the loop. The `(triage_id, operator_id)`
key is the row's actual PK — there is no surrogate `id`.

### Input classification

`classifyInputs(row)` examines the Operator's declared input Tag
keys (taken from the snapshotted Contract via the row's
`type_key` + `type_code_version` + `op_config_json`):

For each declared input Tag key:

- Look it up in `tags` for `(triage_id = current_triage, key)`.
  If present → satisfied.
- Otherwise, find the Operator in this Triage that owns the Tag
  key (by inspecting sibling `triage_operator_runs` rows'
  snapshotted contracts):
  - If owner is `failed` or `skipped` → `definitively_missing`
    (cascade skip)
  - If owner is `completed` but didn't produce the Tag → data
    inconsistency; treat as `definitively_missing` and log
  - If owner is `pending` or `running` → wait

If all inputs are satisfied → `satisfied`. If at least one is
`definitively_missing` and the rest are satisfied or missing →
`definitively_missing` with reason. Otherwise → `pending`.

Raw Message fields are always considered satisfied — the
Message is loaded as part of the Triage context.

### Worker pool

Default size: 3 (configurable). Each worker processes one
Operator at a time. Async functions on the same event loop —
the bottleneck is network I/O (LLM, Gmail, Pushover), not CPU.

Worker function (sketch):

```ts
async function workerRun(opRunRow) {
  const opSnapshot = {
    type_key: opRunRow.type_key,
    type_code_version: opRunRow.type_code_version,
    config: JSON.parse(opRunRow.op_config_json),
  }
  const message = loadMessage(opRunRow.triage_id)
  const tagsInScope = loadTags(opRunRow.triage_id)

  const controller = new AbortController()
  const timeoutMs = opSnapshot.config.timeoutMs ?? 30_000
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)

  const ctx = buildContext(opSnapshot, opRunRow, controller.signal)

  try {
    await runOperator(opSnapshot, { message, tags: tagsInScope, ...ctx })
    persistOperatorResult(opRunRow, 'completed', null, ctx.collectUsage())
  } catch (err) {
    const reason = controller.signal.aborted ? 'operator_timeout' : err.message
    persistOperatorResult(opRunRow, 'failed', reason, ctx.collectUsage())
  } finally {
    clearTimeout(timer)
  }
}
```

`runOperator(snapshot, args)` dispatches on `snapshot.type_key`
into the code-resident Operator type registry, invoking the
implementation matching `snapshot.type_code_version`.

`persistOperatorResult` does (single `BEGIN IMMEDIATE`
transaction — see data-model write-pattern for details):

1. UPDATE `triage_operator_runs` (status, finished_at,
   duration_ms, resource_usage_json, error_summary)
2. INSERT any output Tag rows into `tags`
3. INSERT `triage_events` for each Tag write (`tag_set`) and
   each Resource operation event (`resource_op_succeeded`,
   `resource_op_limited`, `resource_op_failed`) that the ctx
   accumulated during the run. Each INSERT computes
   `sequence_num` via an `INSERT ... SELECT COALESCE(MAX(...), 0) + 1`
   in a single statement — not a separate SELECT then INSERT.
4. **Settlement check, inside the same transaction**: if no
   sibling `triage_operator_runs` rows for this Triage remain
   in `('pending', 'running')`, UPDATE `triages.status` to the
   derived final status, set `ended_at`, and UPSERT
   `current_triages` via the conditional single-statement
   UPSERT. The in-transaction settlement is what makes
   concurrent worker completions safe — only one worker wins;
   the other sees the settled state on its next transaction.

There is no separate `maybeSettle` call after the transaction.
Settlement is part of the persist transaction itself.

---

## Resource clients and operation outcomes

Resources are exposed to Operators via injected metered clients.
Each operation a client exposes returns a **discriminated result**
so the Operator can choose how to react:

```ts
type ResourceOpResult<T> =
  | { outcome: 'succeeded'; value: T }
  | { outcome: 'skipped_by_limit'; limit_id: number; scope: 'per_window' | 'per_message' }
  | { outcome: 'failed'; error: Error }

interface PushoverClient {
  send_notification(args: SendArgs): Promise<ResourceOpResult<{ message_id: string }>>
}
```

The default behavior for most Operators when receiving
`skipped_by_limit` is "treat as a clean no-op" — the Operator
records that it tried, the system logged the limit hit, and the
Operator completes successfully. An Operator that wants
different behavior can inspect the result and throw.

### Limit check, per attempted operation

Before each Resource operation invocation:

1. Look up `limits` rows matching `(user_id, resource, operation)`
2. For each Limit:
   - **`per_window`**: read+update `limit_counters_window` for
     `limit_id`. Tumbling reset if expired. If
     `count < max_count`, increment, allow. Otherwise deny.
   - **`per_message`**: UPSERT `limit_counters_message` for
     `(limit_id, message_id)`. If `count < max_count`,
     increment, allow. Otherwise deny.
3. If any Limit denies, the operation returns
   `{ outcome: 'skipped_by_limit', limit_id, scope }` — the
   external API is never called.
4. If all Limits allow, the client invokes the underlying API
   (with its own retry policy; see below).

The Operator never sees the Limit check directly; the metered
client encapsulates it.

### Retry policy per Resource operation

Retries happen inside the client wrapper, transparent to the
Operator. Per-operation policy:

| Resource operation                           | Retry policy                          | Rationale           |
| -------------------------------------------- | ------------------------------------- | ------------------- |
| `pushover_api.send_notification`             | **No retry**                          | Non-idempotent      |
| `gmail_api.apply_label`                      | **Retry 2× with backoff**             | Idempotent          |
| `gmail_api.send_message`                     | **No retry**                          | Double-send is bad  |
| `llm_bedrock.invoke_model`                   | **Retry 3× with exponential backoff** | Charged on response |
| `gmail_api.fetch_metadata` / `list_messages` | **Retry 3× with exponential backoff** | Read-only           |

All retries within a single operation count **once** against the
Limit.

### Failure semantics

If the external API fails after retries: client returns
`{ outcome: 'failed', error }`. The Operator decides what to do
— typically rethrow, which marks the Operator `failed`;
downstream Operators that depend on its outputs cascade to
`skipped`; Triage settles to `partial`.

---

## Operator failures

A failed Operator does **not** fail the Triage. Downstream
Operators that depend on its outputs cascade to `skipped`;
Operators with no dependency on the failed one run normally.

Operator-level retries are **not done** in MVP. The User can
manually replay the Triage if they want; the next Triage is a
fresh attempt.

---

## Timeout enforcement

Two layers cover MVP needs.

### Layer 1: SDK-level timeouts via AbortController

Every metered Resource client is built with the AbortSignal from
the Operator's timeout controller. The AWS SDK, `fetch`, and
`googleapis` all support `AbortSignal`. When the signal aborts,
the in-flight HTTP request is canceled at the TCP layer.

```ts
async function bedrockInvoke(prompt: string, signal: AbortSignal) {
  return bedrock.send(new InvokeModelCommand(...), {
    abortSignal: signal,
    requestTimeout: 30_000,
  });
}
```

### Layer 2: Operator-level timeout

The worker wraps Operator execution in an AbortController + timer
(`config.timeoutMs ?? 30_000`). The signal flows into all
Resource clients via the ctx, so canceling the Operator cancels
its in-flight network calls.

If an Operator misbehaves and ignores the signal (CPU-bound),
the `await` rejects but the work keeps running in the
background. For MVP this is acceptable; Operator implementations
are our code.

### Layer 3: External watchdog (deferred)

A periodic check that scans for `triage_operator_runs` rows in
`status='running'` with `started_at < now - max_allowed_duration`
and marks them `failed`. Defense against a wedged worker. Not
needed for MVP.

---

## Provider polling (Gmail)

The Gmail Provider uses the **History API** for incremental
polling:

1. First sync after Account creation: full
   `users.messages.list` with `q='in:inbox newer_than:30d'`
   (configurable initial window). Each Message is INSERTed; the
   most recent `historyId` is stored as
   `accounts.last_history_cursor`.
2. Subsequent polls: `users.history.list?startHistoryId=cursor`.
   For each `messageAdded`, INSERT the Message + enqueue a
   Triage. The cursor advances to the History API response's
   top-level `historyId` (the mailbox's current historyId at
   query time, stable across paginated pages) — not any
   per-history-record id.
3. If the API returns "historyId expired" (Gmail retains history
   for ~7 days), fall back to a query-based list using
   `last_polled_at` as the time bound, dedup against existing
   `messages` rows by `backend_message_id`, advance the cursor.

**Cursor crash-safety by ordering.** The cursor must never advance
past an arrival that wasn't durably enqueued. Because `enqueueTriage`
owns its own transaction (and SQLite forbids nesting), the poll cycle
guarantees this by _ordering_ rather than one literal transaction:
all Message upserts + Triage enqueues commit first, and the
`accounts.last_history_cursor` + `last_polled_at` advance is the
cycle's last write. A crash before that advance leaves the cursor
unadvanced; the next poll re-lists the same candidates, which upsert
as not-new (`isNew=false`) and are not re-enqueued. The invariant
holds; the mechanism is ordered idempotent writes, not a single
transaction.

Polling is skipped entirely for Accounts with
`active_pipeline_id IS NULL`.

---

## Contract validation lifecycle

### At Pipeline edit (save-time)

Validation happens whenever an Operator is created, edited, or
deleted within a Pipeline. The full Pipeline is re-validated as
a unit by reading all enabled Operators' `config_json` rows for
the Pipeline. Rejection is on the save.

Checks performed:

- Every declared input Tag key references another enabled
  Operator's output Tag within the same Pipeline (no dangling
  deps)
- No two enabled Operators declare the same output Tag key
  (single-producer enforcement — runs in app code over the
  Pipeline's enabled `operators.config_json` values, inside a
  `BEGIN IMMEDIATE` transaction to serialize concurrent edits)
- No cycles in the resulting Pipeline DAG
- All referenced `type_key` values exist in the code-resident
  Operator-type registry; the `type_code_version` is the
  currently-deployed version
- Tag value enums are well-formed
- Declared Resources are in the system's enum; declared
  operations are in each Resource's exposed operation set

### At Triage creation

A lightweight recheck confirms the Pipeline is still valid
(e.g., no Operator's `type_key` references a type that no longer
exists in code). If invalid: mark the Triage `failed`
immediately without inserting any `triage_operator_runs` rows.

### Not at Daemon startup

The Daemon doesn't validate Pipelines on startup. Validation is
a save-time responsibility.

---

## Tag and config lifecycle on changes

### Operator disabled or deleted

`operators.enabled = false` or `deleted_at = now`. Existing Tags
produced by prior Operator runs remain in `tags` (with their FK
back to the runs that produced them; the snapshots on those runs
preserve the configuration the User had at the time). New
Triages don't enqueue runs for the disabled Operator; downstream
Operators cascade to `skipped`.

### Operator removes an output Tag key

Validator allows; on save:

- `operators.config_json` is UPDATEd in place; the output Tag
  key is no longer declared
- Existing `tags` rows for that key remain (referenced by old
  `triage_operator_runs` whose snapshots still reflect the
  Operator producing the key)
- Future Triages don't produce the key; downstream Operators
  whose input was that key cascade to `skipped`

### Operator changes a Tag value enum

- Adding values: always allowed
- Removing values: rejected if any in-flight or recent Triage's
  snapshots emit Tags with the removed value (or allowed with a
  warning, since old Tags are forensic-only)

### Pipeline swapped on an Account

`accounts.active_pipeline_id` changes. No Tags are touched. The
next poll triggers Triages under the new Pipeline; their Tags
go in fresh rows under the new Triage IDs. The `current_triages`
cache for `(message_id, pipeline_id)` for the new Pipeline gets
populated as Triages settle.

### Operator-type code version changes (deployment)

When the Daemon starts with new code, the code-resident
Operator-type registry advertises the new `code_version` strings.
Existing `operators` rows still carry the old `type_code_version`
they were created/edited with — their next Triage's
`triage_operator_runs` snapshot the _old_ code version, and
execution dispatches into the matching code path (assuming the
old code is still present in the build).

When the User next edits an Operator, the save flow captures the
currently-deployed `type_code_version` into the row.

Post-MVP, a "bring all Operators to current code" command could
batch-update `operators.type_code_version` to the current value
without otherwise changing config. Not in scope for MVP.

---

## Daemon lifecycle

### Startup sequence

1. Open State DB (SQLite + WAL — atomicity guaranteed)
2. Load Provider and Operator-type implementations from code
3. **Recovery sweep** (single transaction):
   ```sql
   UPDATE triage_operator_runs
   SET status = 'failed',
       finished_at = ?,
       error_summary = 'daemon interrupted'
   WHERE status = 'running';
   ```
4. Start the four loops + HTTP server. The execution loop picks
   up `status='pending'` rows and resumes; newly-`failed` rows
   cascade `skipped` states to dependents; Triages settle
   naturally to `partial`.

### Steady state

Continuous run under systemd (`Restart=always`). In a quiet
week, no restarts at all.

### Restart triggers

| Trigger        | Cause                    | Frequency       |
| -------------- | ------------------------ | --------------- |
| Planned deploy | New binary               | Weeks to months |
| Host reboot    | Patching                 | Monthly         |
| Crash          | OOM, unhandled exception | Should be zero  |
| Forced restart | Ops debugging            | Rare            |

### What survives a restart

- All committed State DB writes
- All Tags produced by `completed` Operator runs
- All `triage_events` committed before the crash
- Per-Message Limit counters (`limit_counters_message`)
- Per-window Limit counters (`limit_counters_window`)

### What doesn't survive a restart

- In-flight Operator runs (marked `failed` by recovery sweep)
- External-state divergence: if the Daemon crashes between a
  Resource operation succeeding externally and the matching
  `resource_op_succeeded` event being committed locally, the
  external action happened but Grinbox forgot. The Operator's
  run is marked `failed`; if a future Triage attempts the same
  operation, the per-Message Limit counter wasn't incremented
  (because the transaction didn't commit), so the retry fires
  again. Edge case worth understanding; mitigating it would
  require two-phase commit with the external API, which most
  APIs don't support.

### Crash-loop prevention

If startup fails, exit with non-zero. systemd's `RestartSec=`
adds a delay between restart attempts.

### Shutdown

On `SIGTERM`:

1. Stop accepting new HTTP requests
2. Stop the poll loop
3. Allow in-flight workers to complete (hard timeout 30s)
4. Workers still in flight at the hard timeout: rows stay
   `running` and get swept on next startup
5. Close DB connection cleanly

---

## Resource consumption tracking

Operators declare Resources + operations in their Contract. At
execution time, the Daemon builds a context object containing
metered clients for only the declared Resources:

```ts
function buildContext(opSnapshot, opRunRow, signal) {
  const declared = contractFor(opSnapshot).resources
  // [{ resource: 'pushover_api', operations: ['send_notification'] }, ...]
  const ctx = {}
  const events = [] // accumulates triage_events to write at completion
  const usage = {} // accumulates resource_usage_json

  for (const { resource, operations } of declared) {
    ctx[resource] = makeMeteredClient(resource, operations, {
      signal,
      userId: opRunRow.user_id,
      messageId: opRunRow.message_id,
      operatorId: opRunRow.operator_id,
      triageId: opRunRow.triage_id,
      onEvent: (event) => events.push(event),
      onUsage: (op, delta) => mergeUsage(usage, resource, op, delta),
    })
  }

  ctx.collectUsage = () => ({ usage, events })
  return ctx
}
```

`contractFor(opSnapshot)` resolves the Contract from the
code-resident registry using
`(opSnapshot.type_key, opSnapshot.type_code_version)` — the
Contract is a property of the code, not the snapshot.

Each metered client:

- Performs Limit checks before the underlying call
- Wraps retries (per-operation policy)
- Records metering (bytes, tokens, cost, duration) per attempt
- Returns the discriminated result to the Operator
- Pushes a `triage_events` payload to the accumulator for each
  outcome

When the Operator completes, the worker writes:

- `triage_operator_runs.resource_usage_json` from the
  accumulated usage map
- `triage_events` rows from the accumulator (in attempt order)

UI metric dashboards aggregate from these existing tables
directly — no separate telemetry-rollup store. Daemon-level
operational events (startup, shutdown, errors) go to logs
(systemd journal), not to the DB.

---

## Open issues

- **Worker pool implementation** — async functions on the event
  loop for MVP. Revisit with `worker_threads` if anything
  becomes CPU-bound.
- **Multi-process contention** — defer until needed.
- **External watchdog (Layer 3 timeout)** — deferred.
- **Per-Account fairness in the execution loop** — pure FIFO
  for MVP.
- **Crash-edge: Limit counter not incremented after successful
  external call but pre-event-commit** — accepted edge case.
- **History API edge cases for Gmail** — handled in the Gmail
  Provider implementation.
- **"Reset per-Message Limits for this Message"** — post-MVP
  UI affordance.
- **Bringing all Operators to current code version** — post-MVP
  batch-update operation when a deployment changes a type's
  code version semantics.
