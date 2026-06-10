# Grinbox architecture

Stable design decisions for the Grinbox application. Vocabulary
is defined in [glossary.md](glossary.md); this document assumes
familiarity with those terms. The State DB schema is in
[data-model.md](data-model.md); execution semantics in
[pipeline-runtime.md](pipeline-runtime.md).

This document covers the application itself. It does not cover
any specific deployment topology (where the App VM lives, what
its backup strategy is, how secrets are sourced) — those
decisions are deployment-specific.

---

## Overview

Grinbox is a single long-running application that watches a
User's email Accounts and applies a configured Pipeline to each
new Message. The Pipeline runs Operators that produce Tags
(LLM-driven or rule-driven) and/or invoke Actions on the User's
behalf (notify them, apply a Category to the Message on its
backend, summarize into a daily digest).

A User interacts with Grinbox through a web UI served from the
same process: configure Pipelines, browse Triage results,
inspect why a particular Message was tagged or acted on, edit
rules.

---

## Process model

A single Node.js Daemon (`grinbox.service`) owns everything:

- HTTP server (REST API + static SPA)
- In-process scheduler (cron-style; drives the poll loop)
- Pipeline executor (runs queued Operator runs through worker
  dispatch)
- State store (SQLite via `better-sqlite3`, WAL mode)
- Provider clients (Gmail API today; IMAP later)

There are no separate worker processes, timer units, or job
queues. The Daemon is the system; the CLI is a thin client that
talks to it over loopback HTTP.

Rationale: the workload is single-tenant and modest (a
steady-state inbox, polled every few minutes). The simplicity of
one process, one SQLite file, one HTTP endpoint outweighs any
horizontal-scaling flexibility a multi-process architecture
would buy.

---

## Data flow

When the poll loop discovers a new Message:

1. The Provider fetches the Message metadata
2. A Triage is enqueued: one `triage_operator_runs` row per
   enabled Operator in the Account's active Pipeline, each
   carrying a snapshot of the Operator's current configuration
3. The execution loop picks up ready Operator runs (those whose
   declared input Tags are present in the current Triage)
4. For each Operator run:
   - **Tagger** — produces one or more Tags, stored under the
     current Triage
   - **Action** — invokes its declared Resource operations
     (subject to Limits)
5. When all runs settle, the Triage's status is finalized
   (`completed` / `partial` / `failed`) and the
   `current_triages` cache is updated

Tags are **Triage-scoped**: each Triage produces its own Tag
set. The "current Tags on a Message" the User sees in the UI is
the output of the latest-started, settled Triage for that
`(message, pipeline)`. Replay Triages start with empty Tag
state.

---

## Operator model

Three patterns over the unified Operator primitive:

| Pattern    | Output Tags      | Resource operations                   |
| ---------- | ---------------- | ------------------------------------- |
| **Tagger** | one or more      | read-only / metered (LLM calls, etc.) |
| **Action** | none (typically) | one or more mutating                  |
| **Hybrid** | one or more      | one or more mutating                  |

All Operators declare a Contract specifying:

- **Inputs**: specific upstream Tag keys (the full Message is
  always available — no per-field declaration)
- **Outputs**: declared Tag keys with their value enums; every
  declared output Tag is required when the Operator runs
- **Resources**: each Resource the Operator uses, with the
  specific operations it will invoke

The Contract is a property of the Operator's _type + code
version_, derived from a code-level metadata export — not stored
per-instance. The User-configurable part is `config_json` on the
Operator row (prompt text, rule list, output Tag key choice,
etc.), edited in place.

### Tagger types

- **LLM Tagger** — single LLM call produces one or more Tags
  from declared enums. Multi-Tag output is the main reason to
  use an LLM Tagger over multiple Rule-based Taggers: one call,
  many Tags, shared model context. **Model tier**: a fast model
  (Claude Haiku) is the right default for high-volume
  per-Message Tagging; more capable models (Claude Sonnet) are
  reserved for low-volume generative work like Digest delivery's
  summarization. The cost asymmetry favors this two-tier split.
- **Rule-based Tagger** — deterministic; produces exactly one
  Tag derived from a Rule list evaluated against the declared
  input Tags and any Message field. For multiple derived Tags,
  configure multiple Rule-based Taggers.

### Operator graph

Operators within a Pipeline form a directed acyclic graph via
their Contract input/output dependencies. The graph is
validated at Pipeline save time (the save is rejected on
cycles, unsatisfiable dependencies, or two Operators declaring
the same output Tag key). At Triage enqueue, the validated
graph determines which `triage_operator_runs` rows get created
and in what order they become eligible for the execution loop
based on input availability.

### Pipeline scoping

Each Account is associated with at most one Pipeline; only
Messages on Pipeline-associated Accounts are Triaged. A User
may have many Pipelines — e.g., one for a work Account and
another for a personal Account, or two competing configurations
to compare.

---

## Resources and Limits

Every action Grinbox takes that touches anything outside its
own process happens via a declared Resource operation. Resources
are a **predefined, enumerable set**:

| Resource       | Operations                                                       |
| -------------- | ---------------------------------------------------------------- |
| `gmail_api`    | `fetch_metadata`, `list_messages`, `apply_label`, `send_message` |
| `pushover_api` | `send_notification`                                              |
| `llm_bedrock`  | `invoke_model`                                                   |

Operators declare both the Resource they use _and_ the specific
operations they intend to invoke. The Daemon injects a metered
client per declared Resource that exposes only the declared
operations — Operators cannot perform undeclared operations
because the methods don't exist on the injected object.

**Limits** are per-User caps on Resource operations, scoped
either to a rolling time window (`per_window`: "max 10
`pushover_api.send_notification` per 600s") or to a single
Message (`per_message`: "at most 1
`pushover_api.send_notification` per Message"). When a Limit is
hit, the metered client returns `skipped_by_limit` and the
Operator decides whether to treat it as a clean no-op or to
hard-fail.

The `per_message` scope is how cross-Triage dedupe works:
replays don't re-fire Notify because the per-Message counter is
already exhausted.

Limits exist because automated email triage can run away fast:
a small bug can become a flood of notifications or a high
external-API bill within minutes. The backstop is intentionally
non-negotiable — Operators cannot opt out of a Limit, only
react to being skipped.

---

## State

A single SQLite file holds all persistent state — configured
Pipelines and Operators, Messages with their Triage history,
Tags scoped to those Triages, Limit counters, and the
`change_log` audit trail.

Grinbox is **durable**: user-edited Operator configurations
cannot be replayed from any external source, so the State DB
must be backed up. (Backup mechanism is a deployment concern;
the application just maintains the file.)

The Daemon opens the State DB once at startup and keeps the
connection open for the process lifetime. `better-sqlite3`'s
synchronous API matches the single-process workload — no async
ceremony for what amounts to memory-mapped file I/O.

Daemon-level operational events (startup, errors, HTTP request
metrics) go to logs (systemd journal), not into the DB. UI
metric dashboards aggregate from the per-Triage data
(`triage_operator_runs.resource_usage_json`, `triage_events`)
directly.

---

## Backends and Providers

The Provider abstraction is the seam between Grinbox and any
specific mail backend. Each Provider implements:

- `list_candidates` — return Message IDs in the candidate set
  (the History API for Gmail; query-based for IMAP)
- `fetch_metadata` — return Message metadata
- `apply_category` — add a Grinbox-owned Category (invokes the
  Provider's `apply_label`-equivalent Resource operation)
- `thread_membership` — return Thread context for a Message

MVP ships a **Gmail Provider**. IMAP is a future addition that
slots into the same interface.

Categories are the cross-backend abstraction for "categorical
metadata on a Message" — Gmail labels, IMAP folders, RFC-5788
keywords. The Provider is responsible for translating
Grinbox's Category concept to whatever the backend supports.

---

## Web UI

Single-page React app served as static assets from the same
Daemon. Connects to the REST API on the same host via Hono's
typed RPC client (full type inference from server route
definitions to frontend calls).

**MVP posture**: lab-internal, no authentication. The Daemon
listens on its own IP and trusts every request from the
deployment network. The one exception is the Gmail OAuth
callback: a single path (`/oauth/callback`) is exposed over TLS
via the reverse proxy because Google requires an `https` redirect
URI. The UI and API themselves are never served over that public
hostname — see [oauth-flow.md](oauth-flow.md).

Multi-user support is not in MVP, but the User term is defined
in the glossary and the schema is designed to accommodate
per-User scoping later without restructuring.

---

## Tech stack

| Layer                | Choice                            |
| -------------------- | --------------------------------- |
| Runtime              | Node.js 24.x                      |
| Language             | TypeScript                        |
| HTTP framework       | Hono + Hono RPC client            |
| Database driver      | better-sqlite3                    |
| Query builder        | Kysely                            |
| In-process scheduler | croner                            |
| Frontend framework   | React + Vite                      |
| UI primitives        | shadcn/ui + Tailwind CSS          |
| Routing              | TanStack Router                   |
| Forms                | TanStack Form                     |
| Tables               | TanStack Table                    |
| Server-state cache   | TanStack Query                    |
| Charts               | Recharts                          |
| Validation           | Zod (shared server/client)        |
| LLM client           | `@aws-sdk/client-bedrock-runtime` |
| Gmail client         | `googleapis`                      |
| Linter/formatter     | Biome                             |
| Test runner          | Vitest                            |
| Package manager      | pnpm workspaces                   |

### Repo layout

```
apps/grinbox/
├── README.md
├── docs/                         # planning artifacts
└── packages/
    ├── server/                   # Daemon (Hono + Pipeline + DB)
    ├── web/                      # React SPA
    ├── shared/                   # Zod schemas + shared types
    └── cli/                      # Thin CLI client (talks to Daemon)
```

---

## Out of scope for MVP

Captured here so they're explicit and don't sneak into M1–M5:

- **Snooze** — user-initiated "remind me in N days" deferral
- **Feedback** — user-supplied corrections on Tags
- **IMAP Provider** — bringing MXroute (or any IMAP backend)
  under the Pipeline
- **Multi-user auth** — login, per-User scoping enforcement,
  session management
- **Public-facing deployment** — end-user TLS + login auth,
  hosting the UI outside a trusted network (distinct from the
  narrow Gmail OAuth callback in [oauth-flow.md](oauth-flow.md))
- **Notification channels beyond Pushover** — Slack, Discord,
  email notifications, in-browser web push
