# Grinbox implementation status

A point-in-time snapshot of what has been built, for engineers
reviewing the code. **Reflects commit `2d596ee` (2026-05-30).** This
document goes stale as work lands — trust the code over this doc, and
check `git log` for changes after the commit above.

For _design intent_ (the spec the code implements), read
[architecture.md](architecture.md), [data-model.md](data-model.md),
[pipeline-runtime.md](pipeline-runtime.md),
[oauth-flow.md](oauth-flow.md), [ui-design.md](ui-design.md), and
[glossary.md](glossary.md). For the _build sequence_, see
[build-plan.md](build-plan.md) and
[implementation-plan.md](implementation-plan.md) (milestones).

---

## TL;DR — current functional state

Grinbox is a **functionally complete MVP**: the daemon boots, migrates,
runs the execution + poll loops, and serves the typed `/api`, the OAuth
callback, `/healthz`, **and the web SPA**. The full triage pipeline both
**tags and acts** — Rule-based + LLM (multi-output) Taggers, plus the
two Action Operators (Apply Category → Gmail label, Notify → Pushover),
each resolving the right credential per run, with Limits enforced and a
per-Message Limit deduping replays. The web UI drives all of it
(Inbox/Message detail, Pipeline + Operator editor, Accounts/OAuth,
Dashboard, Activity, Settings).

The external clients are **live-wired**: given a Google OAuth client + a
credentialed account, the poll loop polls real Gmail; given a Bedrock
region, the LLM Tagger calls Claude; given a Pushover credential, Notify
sends. **The remaining gap to a live soak is purely external
configuration** — a Google OAuth client and Bedrock IAM (see _Running
it_). Unconfigured, the daemon boots and idles cleanly (poll loop finds
no credentialed accounts and skips them; Action ops without a credential
fail their run → Triage `partial`, never a crash).

**700 tests pass** (single serial worker), unit/integration-level
against an in-memory SQLite DB with mocked external transports (Bedrock,
Google APIs, Pushover) and jsdom for the web. **No live external call is
made anywhere in the suite.**

---

## Milestone status

| Milestone                                              | State                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **M1 — silent Triage** (poll → tag → persist)          | ✅ code-complete + live-wired (Gmail Provider + Bedrock client)                                     |
| **M2 — Action layer** (Apply Category, Notify, Limits) | ✅ complete — Actions fire via per-run credential resolution; `when` value-gate; per-Message dedupe |
| **M3 — read-only UI**                                  | ✅ (full UI shipped)                                                                                |
| **M4 — operator editing**                              | ✅ complete (incl. the Rule-editor side-by-side **live preview**)                                   |
| **M5 — Digest delivery**                               | ❌ not started                                                                                      |

---

## Review status

Every surface has now had at least one independent spec-driven test
review (findings in `.scratch/`), and the findings were worked in full.
Across **all** review rounds (Pass 1 ×2, engine Pass 2, web Pass 2, API
Pass 3, web Pass 4) plus the M2 build, **exactly three real code bugs**
surfaced — every other finding was an untested-but-correct path, now
tested:

1. **Poll-scheduler overlap** (no re-entrancy guard → concurrent
   double-poll) — fixed (in-flight guard + croner `{ protect: true }`).
2. **OAuth pop-up origin check failed open** (trusted any origin when it
   couldn't determine the expected one) — fixed to fail closed; its
   vacuous guarding test rewritten (mutation-confirmed).
3. **Gmail `applyLabel` passed a label _name_ into `addLabelIds`** (needs
   label IDs) — fixed with name→ID resolution (list → match →
   create-on-miss); also fixed the poll-side `applyCategory`.

The reviewers' remaining items (coverage holes, success-only→`path`
assertions, boundary tests, concurrency-rationale tests, the live
`googleapis` adapter, etc.) are all closed. Two carried caveats: the
`BEGIN IMMEDIATE` serialization is verified as single-threaded logic + an
in-transaction proof (synchronous `better-sqlite3` has no await point to
race); web tests share one jsdom document with a global DOM-reset
`afterEach` so Radix portals don't leak.

---

## Running it (populated, for review)

A fresh DB has no user and no messages, so a **demo-seed script**
populates a realistic dataset:

```
cd apps/grinbox && pnpm install && pnpm build
export GRINBOX_TOKEN_ENC_KEY="$(head -c 32 /dev/urandom | base64)"
export GRINBOX_DB_PATH=/tmp/grinbox-demo.db
pnpm --filter @twin-digital/grinbox-server seed:demo      # user, accounts, pipeline,
                                             # ~24 messages w/ triages/tags
node packages/server/dist/main.js            # serves UI + API on :8787
```

Open **http://localhost:8787**. Same key for seed + boot (the demo
credential is encrypted with it); `seed:demo --reset` reseeds. "Add
Account" shows 503 (no Google client) — expected.

For a **live soak** against a real inbox, configure the deployment env:
`GRINBOX_OAUTH_CLIENT_ID`/`_SECRET` (a Google Web OAuth client, see
[oauth-flow.md](oauth-flow.md)) and `GRINBOX_BEDROCK_REGION` (+ AWS IAM
for `bedrock:InvokeModel`), then add an account via the UI's OAuth
pop-up.

---

## Component inventory

| Component                                        | Location                                             | Functional status                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| State DB schema + migrator                       | `server/src/db`, `migrations`                        | Migration applies; constraints/FK/index coverage tested                                                 |
| Daemon (config, crypto, lifecycle, SPA serving)  | `server/src/{config,crypto,daemon,main,http/static}` | Boots → migrate → loops → serves SPA+API; graceful shutdown                                             |
| Shared contracts (Zod)                           | `shared/src`                                         | Source of truth; enum closedness, limits fidelity, registry                                             |
| Operator runtime + 4 built-ins                   | `server/src/operators`                               | Rule-based + LLM (multi-output) Taggers; **Notify + Apply Category Actions** (`when` gate)              |
| Pipeline write patterns + validation             | `server/src/pipeline`                                | Save/validate/enqueue/claim/persist/settle                                                              |
| Metered clients + Limits                         | `server/src/resources`                               | Limit/retry/metering; **per-run credential-backed gmail/pushover Action clients**; live-or-stub Bedrock |
| Execution loop + worker pool                     | `server/src/execution`                               | Drives `runOperator`; per-run client builder; recovery                                                  |
| Gmail Provider + **live client**                 | `server/src/providers`                               | History-API sync + upsert; live `googleapis` client (token-resolved)                                    |
| Poll loop + scheduler + **live ProviderFactory** | `server/src/poll`                                    | Provider→enqueue; credential-backed factory (skip needs-reauth); overlap-guarded                        |
| OAuth flow + token lifecycle                     | `server/src/oauth`                                   | PKCE, encrypted tokens, refresh, re-auth; 503 until configured                                          |
| HTTP API (read + write)                          | `server/src/http/api`                                | Typed `/api`; `ApiRoutes` RPC export; structured 4xx errors                                             |
| Web UI (shell + 6 areas)                         | `web/src`                                            | TanStack Router + shadcn; all areas wired to the typed API                                              |
| Demo seed                                        | `server/src/scripts/seed-demo.ts`                    | Populates a review dataset (`pnpm seed:demo`)                                                           |

Suite total: **700 tests**.

---

## What's NOT built

- **Digest delivery** (M5) — the scheduled daily summary
  (`llm_bedrock` → `gmail_api.send_message`).
- **Live soak** — no real Gmail/Bedrock/Pushover call has been made in
  anger; needs the external config above.
- **CLI** — still a stub.
- **Assorted API enrichments the UI degrades around** (each flagged in
  its commit): Dashboard sparkline series / per-Pipeline notification
  breakdown; Activity-feed `message_id` deep-links on limit/failure rows;
  Inbox tag-key registry priority; credential reveal/rotate + Bedrock
  credential management + About runtime/DB stats. None block the MVP.

---

## Suggested review focus

| Reviewer lens                         | Where to look                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine correctness                    | `execution/`, `poll/` (cycle atomicity, overlap guard, scheduler), the `poll/e2e-silent-triage.test.ts` vertical                                                                                                                     |
| Live external wiring                  | `providers/live-gmail-client.ts`, `poll/live-provider-factory.ts`, `resources/{underlying-clients,action-clients}.ts` (per-run credential resolution)                                                                                |
| Backend adapter                       | `providers/` (History-API sync, expired-cursor fallback, upsert)                                                                                                                                                                     |
| Security                              | `oauth/` (PKCE/state, token storage, refresh, invalid_grant) + `crypto/encryption.ts` + Limits backstop; the web OAuth origin check (`web/src/lib/oauth.ts`); confirm no secret leaves the API (`/api/credentials` is metadata-only) |
| API contract + handlers               | `server/src/http/api` (read shapes, write→write-pattern wiring, structured errors, the `ApiRoutes` RPC type)                                                                                                                         |
| Web UI                                | `web/src` (the six areas; typed-client + TanStack Query wiring; the OAuth pop-up)                                                                                                                                                    |
| Concurrency / transactional integrity | `pipeline/edit-lock.ts`, `pipeline/persist.ts` (settlement, `sequence_num`)                                                                                                                                                          |
| Data model / DB                       | `server/src/db` + `migrations` vs [data-model.md](data-model.md)                                                                                                                                                                     |
| Operator / rule semantics             | `operators/`; the rule DSL in `operators/built-ins/match-expression.ts` (no `eval`)                                                                                                                                                  |

Reviewers should treat data-model.md's "What this schema does not
enforce" list as the correctness spec for the pipeline write paths —
those invariants are enforced in app code, not by the DB.
