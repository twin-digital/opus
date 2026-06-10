# Grinbox data model

Schema for Grinbox's State DB. Depends on
[architecture.md](architecture.md) for the runtime model and
[glossary.md](glossary.md) for vocabulary.

This document has two parts:

- **[Overview](#overview)** — entities, relationships, and how
  the data supports each feature. Read this for the conceptual
  picture.
- **[Schema reference](#conventions)** — column-level table
  definitions, indexes, write patterns, and lifecycle rules.
  Read this when implementing.

---

## Overview

### Message lifecycle

A new Message arrives, gets Triaged one or more times,
accumulates Tags scoped to each Triage, and surfaces in the UI
via the "current Tags" view.

1. **Arrival.** The poll loop discovers a new Message from an
   Account's backend. The Provider fetches metadata; Grinbox
   UPSERTs a `messages` row.
2. **Triage enqueue.** A `triages` row is INSERTed
   (`status='running'`). For each enabled Operator in the
   Account's active Pipeline, a `triage_operator_runs` row is
   INSERTed with the Operator's current
   `(type_key, type_code_version, config_json)` snapshotted
   inline. The Triage is now enqueued.
3. **Operator execution.** The execution loop pulls
   `triage_operator_runs` rows where `status='pending'` and all
   declared input Tags are present in `tags WHERE
triage_id = <this Triage>`. Workers dispatch each ready
   Operator, running it against the snapshotted config.
4. **Tag emission.** As Operators produce output Tags, the
   worker INSERTs rows into `tags` (keyed `(triage_id, key)`)
   and records each write as a `tag_set` event in
   `triage_events`. Downstream Operators waiting on those Tag
   keys become eligible.
5. **Resource operations.** Action Operators invoke Resource
   operations through injected metered clients. Limits are
   checked before each call; outcomes record as
   `resource_op_succeeded` / `_limited` / `_failed` events.
6. **Settlement.** When every `triage_operator_runs` row for
   the Triage is terminal, the worker that completes the last
   one finalizes `triages.status` and UPSERTs `current_triages`
   if this Triage is the latest-started for
   `(message_id, pipeline_id)`.
7. **Visibility.** The Inbox UI joins `messages` →
   `current_triages` → `tags` to show the current Tag set per
   Message. The Message detail view loads the full Triage
   history (all `triage_operator_runs` + `triage_events` +
   `tags`).

Subsequent triggers (user replay; future scheduled re-Triage)
create new `triages` rows that re-enter the lifecycle from
step 2.

### Lineage

Three places hold what looks like "Operator config history."
They serve **three orthogonal roles** — not three redundant
audit trails:

- **Current config** lives on `operators.config_json`. Mutable;
  reflects what each Operator _is_ right now. Read by the UI's
  Operator editor; written by every edit. The
  single-producer-per-Tag-key validation runs over this.
- **Historical execution config** lives on
  `triage_operator_runs.op_config_json` (alongside `type_key`
  and `type_code_version`). Snapshotted at Triage enqueue and
  immutable thereafter; reflects what each Operator _was_ when
  each Triage ran. Read by forensic UI views ("the exact
  config that produced this Tag"). Never updated.
- **Edit-time before/after** lives on `change_log`. Append-only;
  reflects what changed and when, by whom. Read by audit
  views; written by every config-modifying action. Doesn't
  carry execution-time fields; complements the other two by
  capturing intent and authorship.

A Tag traces back to its producing Operator run (composite FK)
which carries its own snapshot — no joins to a versions table
needed. To see what's live now, read `operators`. To trace
authorship and changes over time, query `change_log`.

### The big picture

Grinbox state is rooted at the User. Per-User tables carry
`user_id`; per-Pipeline tables carry `pipeline_id`. Operator
types are a closed, code-resident enum — not a table.

```
users
├── accounts
│   ├── credentials                (kind=gmail_oauth; account-scoped)
│   ├── messages
│   │   └── triages
│   │       ├── triage_operator_runs   (snapshots op_config_json inline)
│   │       ├── tags                   ──FK──>  triage_operator_runs
│   │       └── triage_events          ──FK──>  triage_operator_runs
│   └── ──active_pipeline──>  pipelines
├── credentials                    (kind=pushover; user-scoped)
├── pipelines
│   └── operators                  (mutable config_json + type_key + type_code_version)
├── limits
│   ├── limit_counters_window
│   └── limit_counters_message
└── change_log

current_triages   ──cross-cut (message_id × pipeline_id)──>  triages
schema_migrations  (migration bookkeeping)
```

Two key choices that shape the model:

1. **Tags belong to a Triage**, not directly to a Message.
   "Current Tags on a Message in a Pipeline" is a derived view —
   the output of the latest-started, settled Triage for that
   `(message, pipeline)`. The `current_triages` table is a
   denormalized cache that makes this lookup an O(1) join.

2. **Operator versions live inline on each `triage_operator_runs`
   row**, not as a separate history table. When a Triage is
   enqueued, each Operator run captures its Operator's current
   `config_json` and `type_code_version` as snapshots on the run
   row. The Operator's current configuration is just a mutable
   column on `operators`; "what was this Operator's config at
   the time of that Triage" is answered by reading the
   corresponding run row.

### Entity groups

#### Tenancy

- **`users`** — one row per person who uses Grinbox.

#### Backends and credentials

- **`accounts`** — one row per configured mail backend. Holds
  provider type, polling cadence, last-polled cursor, and a
  nullable `active_pipeline_id`. Without an active Pipeline, the
  Account is not polled and no Triage runs.
- **`credentials`** — one row per stored credential, of any
  kind. `kind` discriminates (`gmail_oauth`, `pushover`);
  `account_id` is set for account-scoped credentials (OAuth) and
  NULL for user-scoped credentials (notification channels).
  `data_enc` is the kind-specific encrypted JSON payload.

#### Pipelines

- **`pipelines`** — a named bundle of Operators owned by a User.
  Self-contained: a Pipeline's Operators belong to it and aren't
  shared with other Pipelines.

#### Operator configuration

- **`operators`** — per-Pipeline. Holds the mutable Operator
  configuration: `type_key` (closed code-resident enum like
  `llm_tagger`, `notify`), `type_code_version` (captured at last
  edit from the deployed code), `config_json`, `enabled` flag.
  Edits UPDATE in place. Historical config lives in snapshots
  on `triage_operator_runs`.

Single-producer-per-Tag-key is enforced in app code at Operator
save time inside a `BEGIN IMMEDIATE` transaction, so the
validate-read-then-update is atomic against concurrent edits.
See [write patterns](#operator-save-edit) for the algorithm.

#### Messages and Tags

- **`messages`** — cached per-Account Message metadata + body.
  One row per `(account, backend_message_id)`. Body fields are
  nullable and may be filled lazily.
- **`tags`** — Tag rows produced by Operator runs.
  **Triage-scoped**: keyed `(triage_id, key)`. Composite FK to
  `triage_operator_runs(triage_id, operator_id)` identifies the
  producing run. Tags do not propagate between Triages.
- **`current_triages`** — denormalized lookup at the
  `(message, pipeline)` cross. Maps each `(message_id,
pipeline_id)` to the most-recently-started settled Triage.
  Lets the Inbox view find current Tags in one join.

#### Triage history

- **`triages`** — one row per Triage. Records `pipeline_id`,
  trigger, timestamps, status.
- **`triage_operator_runs`** — one row per Operator in the
  Pipeline, per Triage. Composite PK `(triage_id, operator_id)`.
  Carries the snapshot of Operator configuration at enqueue.
  Durable state machine plus per-run metering.
- **`triage_events`** — chronological log of Tag writes and
  Resource-operation events.

#### Limits

- **`limits`** — per-User caps on Resource operations. Each row
  is `(resource, operation, scope, max_count, window_seconds)`.
  `scope` is `per_window` or `per_message`.
- **`limit_counters_window`** — current tumbling-window state.
- **`limit_counters_message`** — per-Message counters,
  accumulating.

#### Audit

- **`change_log`** — unified append-only audit for every config
  change across all entities.

#### Migrations

- **`schema_migrations`** — bookkeeping for the migration tool.

### Other workflows

The Message lifecycle above covers the main flow. The
workflows below are user-initiated or supporting flows around
that core.

#### User replays a Message

INSERT a new `triages` row with `triggered_by='user_replay'`
and INSERT fresh `triage_operator_runs` rows snapshotting
current `operators.config_json`. Replay starts with empty Tag
state; dedupe is via per-Message Limit counters that survive
across Triages.

#### User edits an Operator

Inside a `BEGIN IMMEDIATE` transaction:

1. Read all enabled Operators' `config_json` for the Pipeline
2. App-level validate the proposed edit (collision, cycles,
   types, etc.). Reject the save on violation.
3. UPDATE `operators` with new `config_json`, refreshed
   `type_code_version`, `updated_at=now`
4. INSERT `change_log` row

`BEGIN IMMEDIATE` ensures the read-validate-write is atomic
against concurrent edits; the single-producer-per-Tag-key
invariant depends on this.

#### User changes an Account's active Pipeline

UPDATE `accounts.active_pipeline_id`; INSERT `change_log` row.
Next poll triggers Triages under the new Pipeline.

#### "What happened to this Message" forensic view

Load `triages` for the Message (most recent first); for the
selected Triage, load its `triage_operator_runs`, `tags`, and
`triage_events`. Each run row carries the full `op_config_json`
snapshot — no joins to a versions table needed.

#### Notify dedupe

A `per_message` Limit on `pushover_api.send_notification`
(default `max_count=1`) handles dedupe across Triages without
any Tag-based pattern.

#### Metrics dashboard

Metrics come from existing Triage data:

- LLM cost: aggregate
  `triage_operator_runs.resource_usage_json.llm_bedrock.cost_usd_micros`
  over a time range
- Notification volume: count `triage_events WHERE event_type =
'resource_op_succeeded' AND details_json->>'$.operation' =
'send_notification'`
- Triage volume: count `triages` over time

No separate telemetry tables. Daemon-level events
(startup/shutdown/errors) go to logs (systemd journal).

#### Audit query

Query `change_log` for `entity_type=X AND entity_id=Y` ordered
by `recorded_at DESC`. Render before/after JSON client-side.

---

## Conventions

- **IDs.** Most tables with a surrogate PK use plain
  `id INTEGER PRIMARY KEY` — SQLite reuses rowids only after
  hard-delete, and most tables either soft-delete or never
  delete. **Audit/history tables** (`triages`, `change_log`)
  use `id INTEGER PRIMARY KEY AUTOINCREMENT` so IDs are never
  reused — forensic queries reference these IDs after row
  lifecycle events. Tables whose identity is fully captured by
  a natural composite use that composite as the PK
  (`triage_operator_runs`, `triage_events`, `tags`,
  `limit_counters_*`, `current_triages`).
- **Timestamps.** Integer UNIX seconds (UTC). `INTEGER` type.
  Entity tables use `created_at` (set on INSERT, never updated)
  and `updated_at` (set to `created_at` on INSERT, UPDATEd on
  every subsequent edit). Event-log tables (`change_log`,
  `triage_events`) use `recorded_at` to make clear the row is
  an immutable record of when something happened, not an entity
  with a lifecycle.
- **Tenant scoping.** Per-User tables carry `user_id`;
  per-Pipeline tables carry `pipeline_id`. Data-access layer
  enforces; omitting tenant filtering is a compile-time error.
- **Encryption at rest.** Credential payloads use `BLOB` type
  with `_enc` suffix.
- **JSON columns.** Operator configs, event details, error
  payloads.
- **Soft delete.** Most user-editable tables use `deleted_at`;
  name-uniqueness becomes partial unique indexes
  (`WHERE deleted_at IS NULL`) so names can be reused after
  soft-delete. Hard delete is reserved for ephemeral counters
  and cascade cleanup (see [Lifecycle rules](#lifecycle-rules)).
- **`actor_user_id`** is the consistent "who did it" column
  across `change_log` and `triages`.
- **`operator_id`** (not `op_id`) wherever the foreign key
  appears.
- **CHECK constraints** are used on enums that are closed at
  the schema level (status enums for `triages`,
  `triage_operator_runs`; `limits.scope`; `change_log.action`;
  `triage_events.event_type`; `triages.triggered_by`). Enums
  that are **intentionally open** for future expansion don't
  have CHECKs and are noted as such on the column:
  `accounts.provider_type` (opens for `imap` without a
  migration), `credentials.kind` (opens for new notification
  channels), `change_log.entity_type` (opens when new
  configurable entity types are added).

---

## Tenancy

### `users`

```
users
  id          INTEGER  PK
  name        TEXT     NOT NULL
  email       TEXT     UNIQUE
  created_at  INTEGER  NOT NULL
  deleted_at  INTEGER
```

---

## Backend Accounts & Credentials

### `accounts`

```
accounts
  id                     INTEGER  PK
  user_id                INTEGER  NOT NULL  FK → users(id)
  name                   TEXT     NOT NULL
  provider_type          TEXT     NOT NULL  ('gmail'; future: 'imap')
  active_pipeline_id     INTEGER  FK → pipelines(id)  (nullable)
  settings_json          TEXT     NOT NULL
  poll_interval_seconds  INTEGER  NOT NULL  DEFAULT 600
                                   CHECK (poll_interval_seconds BETWEEN 60 AND 86400)
  last_polled_at         INTEGER
  last_history_cursor    TEXT
  last_reconciled_at     INTEGER             -- Unix seconds of the last source-state reconcile; NULL until the first
  created_at             INTEGER  NOT NULL
  deleted_at             INTEGER

CREATE UNIQUE INDEX idx_accounts_name_active
  ON accounts(user_id, name)
  WHERE deleted_at IS NULL;
```

`settings_json` is provider-specific. For Gmail:
`{ email: '<address>' }`. The `last_history_cursor` is a
separate column (mutated on every poll).

### `credentials`

Unified credential store: OAuth refresh tokens, notification
channel keys, future credential types.

```
credentials
  id           INTEGER  PK
  user_id      INTEGER  NOT NULL  FK → users(id)
  account_id   INTEGER  FK → accounts(id)   (nullable)
  kind         TEXT     NOT NULL  ('gmail_oauth' | 'pushover')
  data_enc     BLOB     NOT NULL  -- kind-specific JSON, encrypted
  created_at   INTEGER  NOT NULL   -- equivalent to granted_at
  updated_at   INTEGER             -- equivalent to refreshed_at
  deleted_at   INTEGER

CREATE UNIQUE INDEX idx_credentials_active_account
  ON credentials(user_id, kind, account_id)
  WHERE deleted_at IS NULL AND account_id IS NOT NULL;

CREATE UNIQUE INDEX idx_credentials_active_user
  ON credentials(user_id, kind)
  WHERE deleted_at IS NULL AND account_id IS NULL;
```

Decrypted `data_enc` payloads by kind:

- `gmail_oauth`: `{ refresh_token, access_token, access_token_expires_at, scopes }`. `account_id` set.
- `pushover`: `{ app_token, user_key }`. `account_id` NULL.

Two partial unique indexes — one for account-scoped credentials
(OAuth), one for user-scoped credentials (notification
channels). SQLite's default `UNIQUE` semantics treat NULL
values as distinct, so a single index on
`(user_id, kind, account_id)` would let a User create unlimited
`pushover` rows. The split keeps the semantics tight without
relying on a sentinel value.

**`change_log` for credential changes** captures non-secret
metadata only — `kind`, `account_id`, `created_at`,
`updated_at`, lifecycle action — _not_ the `data_enc` blob.
A row with `data_enc` in `before_json`/`after_json` would be
opaque encrypted bytes (useless to a human auditor) and would
defeat at-rest encryption (the audit log would contain
encrypted credential material in a hex/base64 form indefinitely).
Automated OAuth token refresh writes a `change_log` row with
`actor_user_id=NULL` and `action='updated'`; the before/after
snapshots reflect `updated_at` changing and nothing else.

---

## Pipelines

### `pipelines`

```
pipelines
  id          INTEGER  PK
  user_id     INTEGER  NOT NULL  FK → users(id)
  name        TEXT     NOT NULL
  description TEXT
  created_at  INTEGER  NOT NULL
  deleted_at  INTEGER

CREATE UNIQUE INDEX idx_pipelines_name_active
  ON pipelines(user_id, name)
  WHERE deleted_at IS NULL;
```

---

## Operators

### `operators`

```
operators
  id                 INTEGER  PK
  pipeline_id        INTEGER  NOT NULL  FK → pipelines(id)
  name               TEXT     NOT NULL
  type_key           TEXT     NOT NULL
  type_code_version  TEXT     NOT NULL
  config_json        TEXT     NOT NULL
  enabled            INTEGER  NOT NULL  CHECK (enabled IN (0, 1))
  created_at         INTEGER  NOT NULL
  updated_at         INTEGER  NOT NULL
  deleted_at         INTEGER

CREATE UNIQUE INDEX idx_operators_name_active
  ON operators(pipeline_id, name)
  WHERE deleted_at IS NULL;
```

The Contract is _derived_ at runtime from
`(type_key, type_code_version)` via the code's metadata export.
`config_json` is the per-instance configuration. Examples by
type:

- LLM Tagger:
  `{ model_id, prompt_template, outputs: [{ tag_key, value_enum }, ...] }`
  (one model call produces every declared output Tag)
- Rule-based Tagger:
  `{ output_tag_key, output_value_enum, rules: [...], fallback: {...} }`
- Notify: `{ message_template, credentials_id }`
- Apply Category: `{ category_template }`
- Digest delivery: `{ schedule, model_id, prompt_template }`

Edits UPDATE in place. Historical configurations are captured
on `triage_operator_runs.op_config_json`.

### `operator_credential_references`

Operators reference Credentials by ID from inside opaque
`config_json` blobs (e.g., Notify's
`{ message_template, credentials_id }`). Without a structural
record of those references, "which Credentials does this
Operator use" and "which Operators depend on this Credential"
both require scanning every Operator's `config_json` and
parsing it per type — fragile, opaque, and easy to miss when
adding a new credential-using Operator type.

This junction table captures the references as relational data:

```
operator_credential_references
  operator_id    INTEGER  NOT NULL  FK → operators(id) ON DELETE CASCADE
  credential_id  INTEGER  NOT NULL  FK → credentials(id) ON DELETE RESTRICT
  PRIMARY KEY (operator_id, credential_id)
```

The table is maintained at Operator save (create / edit /
enable / disable): a type-keyed helper
(`extractCredentialRefsFromOperatorConfig`) extracts the set
of `credential_id` values from `config_json`, and the save
transaction reconciles this table (INSERT new references,
DELETE removed ones).

**The FK `ON DELETE RESTRICT` does not fire on Credential
soft-delete**, because soft-delete is an UPDATE (setting
`deleted_at`), not a DELETE statement. The Credential
soft-delete write pattern explicitly queries this table
pre-UPDATE and rejects the operation if any references exist.
The `RESTRICT` clause is decorative for MVP; it becomes
load-bearing if a hard-delete path for Credentials is ever
introduced.

The table's real value is not the FK enforcement but
**queryability and testability**: "what depends on this
Credential" is a PK-prefix lookup instead of a JSON scan, and
the invariant "this table matches `config_json` for every
enabled Operator" reduces to a single per-Operator-type unit
test against the extractor helper.

Disabled Operators still count as references (they may be
re-enabled). Soft-deleted Operators don't — the
Operator-soft-delete write pattern explicitly DELETEs their
junction rows (see [Lifecycle rules](#lifecycle-rules)).

---

## Limits

### `limits`

```
limits
  id                INTEGER  PK
  user_id           INTEGER  NOT NULL  FK → users(id)
  resource          TEXT     NOT NULL
  operation         TEXT     NOT NULL
  scope             TEXT     NOT NULL  CHECK (scope IN ('per_window', 'per_message'))
  max_count         INTEGER  NOT NULL  CHECK (max_count > 0)
  window_seconds    INTEGER
  created_at        INTEGER  NOT NULL

  UNIQUE (user_id, resource, operation, scope)
  CHECK ((scope = 'per_window' AND window_seconds IS NOT NULL AND window_seconds > 0)
      OR (scope = 'per_message' AND window_seconds IS NULL))
```

Defaults seeded per User on install:

| Resource       | Operation           | Scope         | Max | Window |
| -------------- | ------------------- | ------------- | --- | ------ |
| `pushover_api` | `send_notification` | `per_window`  | 10  | 600s   |
| `pushover_api` | `send_notification` | `per_message` | 1   | —      |
| `gmail_api`    | `apply_label`       | `per_window`  | 100 | 600s   |
| `gmail_api`    | `send_message`      | `per_window`  | 5   | 86400s |
| `gmail_api`    | `send_message`      | `per_message` | 1   | —      |
| `llm_bedrock`  | `invoke_model`      | `per_window`  | 50  | 600s   |

Install-time seeding bypasses `change_log` — the seeded rows
are conceptually part of the install, not an action by anyone.

### `limit_counters_window`

```
limit_counters_window
  limit_id      INTEGER  PK, FK → limits(id) ON DELETE CASCADE
  window_start  INTEGER  NOT NULL
  count         INTEGER  NOT NULL
```

Tumbling-window check (see [resource operation invocation](#resource-operation-invocation)).

### `limit_counters_message`

```
limit_counters_message
  limit_id    INTEGER  NOT NULL  FK → limits(id) ON DELETE CASCADE
  message_id  INTEGER  NOT NULL  FK → messages(id) ON DELETE CASCADE
  count       INTEGER  NOT NULL
  PRIMARY KEY (limit_id, message_id)
```

Accumulating; no time reset.

---

## Messages

### `messages`

```
messages
  id                    INTEGER  PK
  account_id            INTEGER  NOT NULL  FK → accounts(id)
  backend_message_id    TEXT     NOT NULL
  backend_thread_id     TEXT
  from_header           TEXT
  to_header             TEXT
  subject               TEXT
  snippet               TEXT
  body_text             TEXT
  body_html             TEXT
  received_at           INTEGER
  created_at            INTEGER  NOT NULL   -- set when the row is created (i.e., when metadata is first fetched)
  body_fetched_at       INTEGER
  headers_json          TEXT
  source_state          TEXT     NOT NULL  DEFAULT 'present'
                          CHECK (source_state IN ('present','archived','trashed','spam','deleted'))
  source_state_at       INTEGER             -- Unix seconds the state last changed
  source_synced_at      INTEGER             -- Unix seconds the state was last confirmed against the backend
  UNIQUE (account_id, backend_message_id)
  INDEX (account_id, source_state, received_at DESC)
```

A Message row outlives its presence in the backend inbox: the triage
history / Tags / replay it anchors are Grinbox's durable value, so the row is
**kept** when the Message is archived, trashed, or deleted at the backend, and
its `source_state` records the current disposition instead. `present` means the
Message is still in the inbox; `archived` that it exists but left the inbox;
`trashed`/`spam` that it sits in those folders; `deleted` that it was purged from
the backend. The poll loop maintains it from the backend's change feed (Gmail
History API label/delete events) with a periodic reconcile as backstop; neither
path deletes rows. The Inbox view defaults to `source_state = 'present'` and can
reveal the rest. `source_synced_at` lets the UI show how recently the state was
confirmed.

`received_at` may be NULL when the backend doesn't provide a
reliable received-time header; the Inbox row index sorts on
`received_at DESC` and treats NULL as last-sort (per SQLite
default). When backfilling, prefer `received_at` if available,
falling back to `created_at` for ordering purposes; the
ingestion path should backfill `received_at = created_at` when
the header is missing so the index covers all rows.

Single table. Body fields are nullable; lazy-fetched when an
Operator that consumes the body needs it.

`body_fetched_at` semantics:

- NULL → body fetch has never been attempted
- non-NULL with empty `body_text`/`body_html` → body was
  attempted; the Message genuinely has no body (or the backend
  returned empty)
- non-NULL with populated body fields → fetched successfully

This distinction matters for the fetcher: NULL means "try
fetching"; non-NULL means "already attempted, don't refetch
unless explicitly forced."

### `tags`

```
tags
  triage_id    INTEGER  NOT NULL
  operator_id  INTEGER  NOT NULL
  key          TEXT     NOT NULL
  value        TEXT     NOT NULL
  created_at   INTEGER  NOT NULL
  PRIMARY KEY (triage_id, key)
  FOREIGN KEY (triage_id, operator_id)
    REFERENCES triage_operator_runs(triage_id, operator_id)
    ON DELETE CASCADE
```

Composite FK ensures every Tag traces to an actual run within
the same Triage.

Tag values are app-level constrained to the producing Operator's
declared enum; SQL has no enforcement. Validation runs in the
metered client / Operator output handling. A Tag value enum
itself must be duplicate-free (enforced in `@twin-digital/grinbox-shared`'s
`valueEnumSchema`).

### `current_triages`

```
current_triages
  message_id         INTEGER  NOT NULL  FK → messages(id) ON DELETE CASCADE
  pipeline_id        INTEGER  NOT NULL  FK → pipelines(id) ON DELETE CASCADE
  triage_id          INTEGER  NOT NULL  FK → triages(id) ON DELETE CASCADE
  triage_started_at  INTEGER  NOT NULL  -- denormalized from triages.started_at
  updated_at         INTEGER  NOT NULL
  PRIMARY KEY (message_id, pipeline_id)
```

Denormalized cache at the `(message, pipeline)` cross. The
`triage_started_at` column is a denormalization of
`triages.started_at` that lets the settlement UPSERT be a
single atomic statement:

```sql
INSERT INTO current_triages (message_id, pipeline_id, triage_id,
                             triage_started_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT (message_id, pipeline_id) DO UPDATE SET
  triage_id          = excluded.triage_id,
  triage_started_at  = excluded.triage_started_at,
  updated_at         = excluded.updated_at
WHERE excluded.triage_started_at > current_triages.triage_started_at;
```

Without the denormalization, the conditional UPSERT would
require a join back to `triages` inside the `WHERE` — not
expressible against `excluded` in SQLite — and would devolve to
a read-modify-write race.

DELETEd by the Pipeline soft-delete cascade (see
[Lifecycle rules](#lifecycle-rules)).

**Populated from any terminal status**, including `partial` and
`failed`. Better to show the partial result than to fall back
to an older complete one; the UI surfaces the Triage's status
so the User knows whether the current Tags came from a clean
run.

Lets the Inbox view do one join to find current Tags rather
than scanning Triage history per Message.

---

## Triage history

### `triages`

```
triages
  id             INTEGER  PK AUTOINCREMENT
  message_id     INTEGER  NOT NULL  FK → messages(id) ON DELETE CASCADE
  pipeline_id    INTEGER  NOT NULL  FK → pipelines(id)
  triggered_by   TEXT     NOT NULL  CHECK (triggered_by IN ('message_arrival','user_replay','user_reset_and_replay','pipeline_changed','scheduled_replay'))
  actor_user_id  INTEGER  FK → users(id)
  started_at     INTEGER  NOT NULL
  ended_at       INTEGER
  status         TEXT     NOT NULL  CHECK (status IN ('running','completed','partial','failed'))
  error_summary  TEXT

  CHECK ((status = 'running' AND ended_at IS NULL)
      OR (status IN ('completed','partial','failed') AND ended_at IS NOT NULL))
```

`pipeline_id` is technically derivable from any of the Triage's
`triage_operator_runs` (via `operators.pipeline_id`). It's
denormalized here for convenience — every Triage-scoped query
filters on it.

`triggered_by` enum:

- `message_arrival`, `user_replay`, `user_reset_and_replay`
  (post-MVP), `pipeline_changed` (post-MVP), `scheduled_replay`
  (post-MVP)

`actor_user_id` is NULL for system-initiated triggers
(`message_arrival`, `scheduled_replay`) and set to the
acting User for `user_replay` and `user_reset_and_replay`.

`status='failed'` is only for system-level errors that prevent
the loop from settling the Triage (rare). Per-Operator failures
cascade to `partial`. `error_summary` is set only on `failed`.

### `triage_operator_runs`

```
triage_operator_runs
  triage_id            INTEGER  NOT NULL  FK → triages(id) ON DELETE CASCADE
  operator_id          INTEGER  NOT NULL  FK → operators(id)
  message_id           INTEGER  NOT NULL  FK → messages(id) ON DELETE CASCADE
  type_key             TEXT     NOT NULL  -- snapshot at enqueue
  type_code_version    TEXT     NOT NULL  -- snapshot at enqueue
  op_config_json       TEXT     NOT NULL  -- snapshot of operators.config_json at enqueue
  status               TEXT     NOT NULL  CHECK (status IN ('pending','running','completed','failed','skipped'))
  started_at           INTEGER
  finished_at          INTEGER
  duration_ms          INTEGER
  skip_reason          TEXT
  error_summary        TEXT
  resource_usage_json  TEXT
  created_at           INTEGER  NOT NULL
  PRIMARY KEY (triage_id, operator_id)

  CHECK ((status IN ('pending','running') AND finished_at IS NULL)
      OR (status IN ('completed','failed','skipped') AND finished_at IS NOT NULL))
```

Composite PK is the natural identity: each Operator runs
exactly once per Triage. No surrogate `id`. This **structurally
forbids retry-as-same-row**; loop-level retry (not in MVP) would
have to create a new Triage rather than re-running an existing
run row.

`message_id` is denormalized from `triages.message_id` because
workers read it on every dispatch (to load the Message and to
key per-Message Limit counters); making the worker join back to
`triages` for every run isn't worth the extra read.

`skip_reason` is free text describing why a run was marked
`skipped`. The common case is "input Tag 'X' not produced
because upstream Operator 'Y' failed" — values are intended for
forensic display, not programmatic dispatch.

`resource_usage_json` shape:

```json
{
  "llm_bedrock.invoke_model": { "calls": 1, "tokens_in": 1234, "tokens_out": 56, "cost_usd_micros": 1200 },
  "pushover_api.send_notification": { "calls": 1, "succeeded": 1, "skipped_by_limit": 0 }
}
```

### `triage_events`

```
triage_events
  triage_id     INTEGER  NOT NULL
  operator_id   INTEGER  NOT NULL
  sequence_num  INTEGER  NOT NULL
  event_type    TEXT     NOT NULL  CHECK (event_type IN ('tag_set','resource_op_succeeded','resource_op_limited','resource_op_failed'))
  details_json  TEXT
  recorded_at   INTEGER  NOT NULL
  PRIMARY KEY (triage_id, sequence_num)
  FOREIGN KEY (triage_id, operator_id)
    REFERENCES triage_operator_runs(triage_id, operator_id)
    ON DELETE CASCADE
```

Composite PK matches the convention for tables with natural
identity. `operator_id` is NOT NULL — every event is
attributable to a specific Operator run. The composite FK
enforces that the referenced run exists.

`event_type` enum:

- `tag_set` — `details_json`: `{ key, value }`
- `resource_op_succeeded` — `details_json`: `{ resource, operation, ...op-specific }`
- `resource_op_limited` — `details_json`: `{ resource, operation, limit_id, scope }`
- `resource_op_failed` — `details_json`: `{ resource, operation, error }`

`sequence_num` is assigned in a single
`INSERT ... SELECT COALESCE(MAX(sequence_num), 0) + 1 FROM
triage_events WHERE triage_id = ?` statement inside the
worker-completion `BEGIN IMMEDIATE` transaction (see the
[Operator run completion write
pattern](#operator-run-completion-per-worker-finish) for the
full SQL). The composite PK is the structural guard against
duplicate sequence_nums.

---

## Audit

### `change_log`

```
change_log
  id             INTEGER  PK AUTOINCREMENT
  user_id        INTEGER  NOT NULL  FK → users(id)
  actor_user_id  INTEGER  FK → users(id)
  entity_type    TEXT     NOT NULL  -- open enum: 'pipeline' | 'operator' | 'account' | 'limit' | 'credential' | future additions
  entity_id      INTEGER  NOT NULL
  action         TEXT     NOT NULL  CHECK (action IN ('created','updated','deleted','enabled','disabled'))
  before_json    TEXT
  after_json     TEXT
  recorded_at    INTEGER  NOT NULL
```

Unified across all configurable entities. Install-time default
seeding does NOT write `change_log` rows — seeded values are
considered part of the install, not actions.

`actor_user_id` is nullable for system-initiated actions (e.g.,
automated OAuth token refresh, future scheduled-replay
triggers).

Single index `idx_change_log_entity` (below) covers the
common-case forensic query. Cross-User dashboards over
`change_log` aren't a target use; if they become one, add
`(user_id, recorded_at)` index.

---

## Migrations

### `schema_migrations`

```
schema_migrations
  name        TEXT  PRIMARY KEY
  timestamp   TEXT  NOT NULL
```

Owned and written by Kysely's `Migrator` (configured with
`migrationTableName: 'schema_migrations'`, plus a
`schema_migrations_lock` table it manages) — one row per
successfully applied migration. The `Migrator` fixes the column
shape (`name`, `timestamp`); nothing else in the application
reads or writes this table. It is the source of truth for "what's
already been applied."

### Migration tooling

**Tool**: Kysely's built-in `Migrator` class. No external tool
required.

**File location**: `packages/server/src/migrations/`. Each
migration file exports async `up(db)` and (optionally)
`down(db)` functions.

**Naming**: timestamp or ordinal prefix — both work with
Kysely's lexicographic sort. Lean: `YYYYMMDDHHMMSS_short_description.ts`
(timestamp). Ordinals (`001_…`) work too; pick one and be
consistent. MVP won't have many migrations.

**Application timing**: the Daemon runs all pending migrations
at startup, _before_ opening the State DB for normal operation.
If any migration fails, the Daemon exits non-zero; systemd
will restart it on its `RestartSec` schedule, hitting the same
failure until the underlying issue is fixed manually. Crash-loop
protection is systemd's job, not the Daemon's.

**Initial schema**: lives as the first migration
(e.g., `20260601000000_initial_schema.ts`), not as raw DDL
outside the migrations directory. Fresh installs run all
migrations in order from empty.

**`down` migrations**: optional and not required. Forward-only
is the operating mode — if a migration introduces a regression,
the fix is a new forward migration that corrects it. Skip
writing `down` for every migration unless an operational story
emerges that genuinely needs it.

**Concurrency**: single-process Daemon means only one migrator
instance ever runs. Kysely's migrator handles inter-process
locking via its bookkeeping if multi-process is ever introduced;
not relevant for MVP.

---

## Indexes (key non-trivial ones)

```sql
-- Execution loop hot path: find ready operator runs FIFO
CREATE INDEX idx_op_runs_pending ON triage_operator_runs
  (status, created_at)
  WHERE status = 'pending';

-- Triage browser by message
CREATE INDEX idx_triages_message_started
  ON triages(message_id, started_at DESC);

-- Resource-operation operational queries
CREATE INDEX idx_resource_ops ON triage_events
  (event_type, recorded_at)
  WHERE event_type IN ('resource_op_succeeded',
                       'resource_op_limited',
                       'resource_op_failed');

-- Inbox row fetch: recent messages on an account
CREATE INDEX idx_messages_account_received
  ON messages(account_id, received_at DESC);

-- current_triages reverse lookup: all current Triages in a Pipeline
-- (powers Inbox views filtered by Pipeline)
CREATE INDEX idx_current_triages_pipeline
  ON current_triages(pipeline_id, message_id);

-- Account polling
CREATE INDEX idx_accounts_polling
  ON accounts(last_polled_at)
  WHERE deleted_at IS NULL AND active_pipeline_id IS NOT NULL;

-- Audit queries by entity
CREATE INDEX idx_change_log_entity
  ON change_log(entity_type, entity_id, recorded_at DESC);
```

The composite PKs on `triage_operator_runs(triage_id,
operator_id)` and `triage_events(triage_id, sequence_num)` serve
all per-Triage lookups and ordered scans via their `triage_id`
prefix; no separate single-column indexes on `triage_id` are
needed for either table.

---

## Lifecycle rules

Cascades and ownership rules aren't visible from FK arrows
alone; documenting explicitly.

### Pipeline soft-delete

When `pipelines.deleted_at` is set:

- All `operators WHERE pipeline_id = X` get `deleted_at` set in
  cascade (same transaction)
- `accounts.active_pipeline_id = X` rows have
  `active_pipeline_id` UPDATEd to NULL
- `current_triages WHERE pipeline_id = X` rows are DELETEd
  (their lookup is no longer meaningful)
- `triages WHERE pipeline_id = X` rows REMAIN, along with their
  `triage_operator_runs`, `tags`, and `triage_events` — they're
  historical forensic data

### Account soft-delete

When `accounts.deleted_at` is set:

- `credentials WHERE account_id = X` rows get `deleted_at` set
  in cascade
- `messages WHERE account_id = X` remain, along with all their
  Triage history (forensic)
- Polling stops because of the deleted-filter on
  `idx_accounts_polling`

### Operator soft-delete

When `operators.deleted_at` is set (either directly or via
Pipeline-cascade):

- No further Triages will enqueue runs for this Operator
- Existing `triage_operator_runs` referencing this Operator
  remain (snapshots are self-sufficient)
- Tags and events produced by past runs remain via composite FK
- `operator_credential_references` rows for this Operator are
  DELETEd (the Operator is no longer using its credentials).
  This frees any Credentials those references were keeping
  alive against Credential soft-delete.

### Limit hard-delete

Limits have no `deleted_at` — they're hard-deleted when no
longer wanted. On `DELETE FROM limits WHERE id = X`:

- `limit_counters_window WHERE limit_id = X` rows are
  CASCADE-deleted (via FK ON DELETE CASCADE)
- `limit_counters_message WHERE limit_id = X` rows are
  CASCADE-deleted
- `change_log` row written with `entity_type='limit'`,
  `entity_id=X`, `action='deleted'`, `before_json` capturing
  the Limit definition

This is the one entity that uses CASCADE rather than soft-delete.
The rationale: Limits are configuration of system policy, not
user content; their counters are ephemeral operational state
that becomes meaningless when the Limit they reference is gone.

### User soft-delete

Out of scope for MVP (single-User installs only). When
multi-User lands, define then.

### Message hard-delete

Not performed in MVP. If introduced later: CASCADE through
`triages` → `triage_operator_runs` → `tags` and `triage_events`

- `current_triages` + `limit_counters_message`. Hard delete is
  a deliberate destructive operation; soft-delete on Messages is
  the more likely future addition.

### `limit_counters_window` and `limit_counters_message`

Rows are created on first attempt and never explicitly deleted.
`limit_counters_message` rows are implicitly invalidated by
Message deletion (cascade above, when applicable).

### `change_log`

Append-only. No deletion. Pruning may be added post-MVP if
volume becomes a concern.

---

## Write patterns

### Triage enqueue (per arrived Message)

Single transaction:

1. INSERT `triages` row (`status='running'`, `started_at=now`)
2. For each enabled Operator in the Pipeline:
   INSERT `triage_operator_runs` row capturing
   `(type_key, type_code_version, op_config_json)` from
   `operators` at this moment; `status='pending'`,
   `created_at=now`

### Operator run completion (per worker finish)

Single `BEGIN IMMEDIATE` transaction (the BEGIN IMMEDIATE
ensures serialization against any other writer's transaction,
including concurrent sibling workers in the same Triage):

1. UPDATE `triage_operator_runs` (status, finished_at,
   duration_ms, resource_usage_json, error_summary)
2. INSERT output Tag rows into `tags`
3. INSERT each `triage_events` row using a single statement
   that computes `sequence_num` from the current MAX inside the
   same transaction:
   ```sql
   INSERT INTO triage_events
     (triage_id, operator_id, sequence_num, event_type,
      details_json, recorded_at)
   SELECT ?, ?, COALESCE(MAX(sequence_num), 0) + 1,
          ?, ?, ?
   FROM triage_events
   WHERE triage_id = ?;
   ```
   The PK `(triage_id, sequence_num)` is the structural guard;
   the in-transaction subquery is the algorithm. Doing the
   SELECT and INSERT as separate statements would be a race
   against concurrent workers in the same Triage.
4. **Check settlement inside this transaction** — query for
   any sibling `triage_operator_runs` rows still in
   `('pending', 'running')` for this `triage_id`. If zero:
   UPDATE `triages.status` to the derived final status and set
   `ended_at`; UPSERT `current_triages` using the conditional
   single-statement UPSERT (see `current_triages` table
   definition).
5. COMMIT

Doing settlement in the same transaction is what makes
concurrent worker completions safe: only one worker wins the
settlement; the other sees `triages.status = 'completed'` (or
similar) on its next transaction and proceeds without a
duplicate UPDATE attempt.

### Resource operation attempt

Limit check inside Operator execution:

1. For each Limit matching `(user_id, resource, operation)`:
   - `per_window`: UPDATE counter with reset logic; check
   - `per_message`: UPSERT counter; check
2. If any denies → return `skipped_by_limit` without calling
3. If all allow → call external API; outcome queued for the
   completion transaction above

### Execution loop claim

```sql
UPDATE triage_operator_runs
SET status='running', started_at=?
WHERE triage_id=? AND operator_id=? AND status='pending'
```

Check `changes === 1` to confirm.

### Operator save (create or edit)

The same write pattern handles all of: creating a new Operator,
editing an existing Operator's `config_json`, enabling /
disabling (separate subsection below), and soft-deleting
(separate subsection below). The variations differ in which
mutation step 4 performs; steps 1–3 (validation) are
identical.

**Inside `BEGIN IMMEDIATE` transaction:**

1. SELECT all enabled Operators for the Pipeline (their
   `config_json`)
2. **Apply the proposed change to the snapshot** (substitute
   the target Operator's new `config_json` in place; or, for
   a new Operator, add it; or, for a deletion, remove it).
   Validation evaluates the _post-state_, not the as-read
   snapshot:
   - Output Tag-key collision (no two enabled Operators in the
     Pipeline may declare the same output key)
   - All declared input Tag keys produced by some other enabled
     Operator
   - No cycles in the resulting DAG
   - Valid type, valid declared resources/operations
3. If validation fails: ROLLBACK; return the error
4. Perform the mutation:
   - **Create**: INSERT new `operators` row (`config_json`,
     `type_key`, `type_code_version` from current deployed
     code, `enabled`, `created_at = updated_at = now`)
   - **Edit**: UPDATE `operators` SET `config_json`,
     `type_code_version` (refreshed from current deployed code),
     `updated_at = now`
5. **Reconcile `operator_credential_references`**: extract the
   set of `credential_id` values from the new `config_json`
   (via the type-keyed
   `extractCredentialRefsFromOperatorConfig` helper); INSERT
   rows for newly-added references; DELETE rows for removed
   ones
6. INSERT `change_log` row with before/after snapshots
   (`before_json` is NULL on create)
7. COMMIT

The `BEGIN IMMEDIATE` is **load-bearing**: it acquires
SQLite's RESERVED lock at transaction start, serializing the
read-validate-write against any other writer. Without it, two
concurrent edits could each independently validate against a
pre-state where the other change hasn't landed, and both could
succeed — creating the impossible state of two Operators
claiming the same Tag key. With it, the second writer waits
for the first to commit, re-reads the post-state, and either
passes or fails validation correctly.

### Operator enable / disable

Toggling `operators.enabled` changes the enabled set the
validation predicate uses, so it needs the same care as a
config edit.

**Inside `BEGIN IMMEDIATE` transaction:**

1. SELECT all enabled Operators for the Pipeline (their
   `config_json`)
2. Apply the proposed enable/disable to the snapshot
3. Validate the post-state (same checks as Operator save:
   inputs all produced, no cycles, no output-key collision)
4. If validation fails: ROLLBACK
5. UPDATE `operators.enabled`, `updated_at`
6. INSERT `change_log` row — `action='enabled'` or
   `action='disabled'` (specifically — _not_ `'updated'`,
   because the enabled-set change is semantically distinct
   from a `config_json` edit and surfaces differently in audit
   views)
7. COMMIT

### Operator soft-delete

Same `BEGIN IMMEDIATE` pattern as enable/disable: apply the
proposed deletion to the snapshot, validate the post-state,
UPDATE `operators.deleted_at`, INSERT `change_log` row.

### Credential soft-delete

The invariant — "a Credential in use by an Operator cannot be
deleted" — is enforced by an explicit pre-UPDATE query against
`operator_credential_references`, not by the FK (see the
section on that table for why the FK doesn't fire on
soft-delete).

**Inside `BEGIN IMMEDIATE` transaction:**

1. SELECT `operator_id` from `operator_credential_references`
   WHERE `credential_id = ?`
2. If any rows exist: ROLLBACK; return error with the list of
   dependent Operators
3. UPDATE `credentials.deleted_at = now`
4. INSERT `change_log` row (non-secret metadata only — see
   [`credentials` section](#credentials))
5. COMMIT

The query in step 1 is a cheap PK-prefix lookup; the junction
table makes the "what depends on this" answer immediate
without parsing `config_json`.

### Pipeline soft-delete

Single `BEGIN IMMEDIATE` transaction:

1. UPDATE `pipelines.deleted_at`
2. UPDATE `operators` SET `deleted_at` WHERE
   `pipeline_id = pipeline.id`
3. DELETE FROM `operator_credential_references` WHERE
   `operator_id IN (SELECT id FROM operators WHERE
pipeline_id = pipeline.id)` — frees any Credentials those
   Operators were pinning against deletion
4. UPDATE `accounts` SET `active_pipeline_id = NULL` WHERE
   `active_pipeline_id = pipeline.id`
5. DELETE FROM `current_triages` WHERE
   `pipeline_id = pipeline.id`
6. INSERT `change_log` row

---

## What this schema does not enforce

Several invariants are critical to correctness but enforced in
app code, not by the DB. The list is the surface area where
bugs can hide; future maintainers should treat each entry as
"if you bypass the documented write path, this breaks."

- **Single-producer-per-Tag-key.** No DB constraint stops two
  enabled Operators in a Pipeline from declaring the same
  output Tag key. Enforced at save time (Operator
  edit / enable / disable / soft-delete write patterns) inside
  a `BEGIN IMMEDIATE` transaction.
- **Tag value within declared enum.** `tags.value` is `TEXT`;
  nothing enforces that the value is in the producing
  Operator's declared enum. Enforced in the metered client /
  Operator output handler.
- **Operator-graph acyclicity.** Cycles would deadlock
  execution. Enforced at Pipeline save time.
- **Operator `type_key` against the code-resident registry.**
  An Operator with a type the running code doesn't know would
  fail at Triage enqueue. Enforced at save time and rechecked
  at enqueue.
- **Resource and operation declarations valid.** Operators
  declaring undeclared Resource operations would fail at
  runtime when the injected client doesn't have the method.
  Enforced at save time against the code-resident Resource
  registry.
- **`operator_credential_references` matches
  `operators.config_json`.** The junction table makes
  credential dependency structurally queryable, but it's
  populated by app-extracted credential IDs from `config_json`
  — a missing extractor for a new Operator type would leave
  references unwritten. Enforced by: each Operator type's
  `extractCredentialRefsFromOperatorConfig` implementation
  must be tested against representative `config_json` samples.
- **Credential soft-delete is blocked when references exist.**
  The `ON DELETE RESTRICT` FK on
  `operator_credential_references.credential_id` only fires
  for hard-DELETE; soft-delete (an UPDATE setting
  `deleted_at`) is gated by an explicit pre-UPDATE query in
  the Credential soft-delete write pattern.
- **Pipeline soft-delete cascades** (Operator soft-delete,
  Account `active_pipeline_id` NULL, `current_triages` DELETE).
  Enforced in app code at the Pipeline soft-delete write
  pattern. DB-level `ON DELETE CASCADE` is configured for
  hard-delete paths (Messages → Triages → runs/tags/events)
  but Pipeline cascades are app-side because Pipelines are
  soft-deleted.
- **`triage_operator_runs.op_config_json` is a faithful
  snapshot of `operators.config_json` at enqueue time.**
  Enforced by the enqueue write pattern; not structurally
  enforceable since the snapshot is inline JSON.

These invariants survive because:

- The Daemon is the sole writer to the State DB
- All mutating paths go through documented write patterns
- Save-time validations run inside `BEGIN IMMEDIATE` to
  serialize the read-validate-write against concurrent edits

If any of those preconditions changes — multiple writer
processes, ad-hoc SQL mutations, web UI calling raw DML — each
invariant needs re-examination.

---

## Implementation notes (load-bearing for the build)

These are not schema items but conventions the implementing
code must follow for the schema's invariants to hold. They
exist because several constraints are app-enforced rather than
DB-enforced; treating them as discretionary will break the
invariants in [What this schema does not
enforce](#what-this-schema-does-not-enforce).

- **`withPipelineEditLock(db, fn)` helper.** Every mutation
  path that touches `operators` (create, edit, enable, disable,
  soft-delete) and every credential soft-delete must go through
  a single helper that opens `BEGIN IMMEDIATE` and runs the
  callback inside it. The helper's existence makes the locking
  requirement structural at the code level; the comment on it
  explains why.
- **`config_json` shape per `type_key` is owned by Zod
  schemas** in `packages/shared/`, indexed by `type_key`. The
  shape examples in this doc are illustrative; the source of
  truth lives in code. New Operator types register their
  `(type_key, code_version, contract, configSchema,
extractCredentialRefsFromOperatorConfig)` tuple in one place,
  and the schema validator + credential reconciler are derived.
- **`op_config_json`, `type_key`, and `type_code_version` on
  `triage_operator_runs` are snapshots — never UPDATEd after
  the run is created.** Workers may UPDATE other columns
  (status, finished_at, resource_usage_json, ...) but never
  these three. Consider a SQLite trigger that raises on UPDATE
  of these specific columns; at minimum, the columns carry a
  loud `-- snapshot, never UPDATE` comment in the migration
  source.
- **Composite FKs on `tags` and `triage_events` must stay
  composite.** A migration that "simplifies" them to
  single-column FKs would break the invariant that every
  Tag/event traces to a real run in the same Triage.
- **The "what this schema does not enforce" list is the spec
  for the test suite.** Every invariant in that section gets a
  focused unit test constructing the bypass scenario and
  verifying the app-level code rejects it.

---

## Open issues

- **Encryption key sourcing**: env var from a systemd-loaded
  permission-restricted file. Decide before M1.
- **Body retention**: kept indefinitely. Revisit if disk
  pressure appears.
- **Tag value type**: all strings. Non-string value support
  would require schema work.
- **Limit-reset UI**: post-MVP affordance to "reset per-Message
  Limits for this Message" so the User can force a re-Notify.
- **`type_key` against a CHECK constraint**: currently
  validated in app code for flexibility. Could add a CHECK
  against a hard-coded enum if drift becomes a problem.
- **`change_log` write volume and pruning**: append-only with
  no current pruning. Revisit if volume grows beyond
  expectations.
- **Cross-User `change_log` dashboards**: if added, add a
  `(user_id, recorded_at)` index then.
