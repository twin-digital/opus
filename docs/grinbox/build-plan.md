# Grinbox build plan

How to _build_ Grinbox: the dependency structure between
subsystems, what can be developed in parallel, and what sits on
the serial critical path.

This is the execution companion to
[implementation-plan.md](implementation-plan.md). The two answer
different questions:

- **Implementation plan** — _when features go live._ The
  milestone sequence (M1–M5) is ordered for safety: silent Triage
  before any Action, read-only UI before editing, Digest last. It
  governs the order of soak checkpoints against a live mailbox.
- **Build plan (this doc)** — _how to staff the build._ The
  dependency tiers and parallel streams below cut across
  milestones. A subsystem can be built well before the milestone
  that puts it into live service.

Vocabulary is in [glossary.md](glossary.md); the subsystems
referenced here are specified in
[architecture.md](architecture.md),
[data-model.md](data-model.md),
[pipeline-runtime.md](pipeline-runtime.md), and
[oauth-flow.md](oauth-flow.md).

---

## The lever: freeze the contracts first

Parallelism hinges on three artifacts. While they are fluid,
every subsystem serializes through whoever is editing them; once
committed, the server internals, the operator library, and the
entire web app proceed concurrently.

1. **`packages/shared` Zod schemas** — operator `config_json`
   shapes keyed by `type_key`, the Resource/operation registry,
   the `Contract` type, and the API DTOs. The seam between server
   and web.
2. **The initial-schema migration** — the full State DB schema is
   specified column-for-column in [data-model.md](data-model.md);
   this is transcription plus the documented indexes and CHECK
   constraints, not a fresh design exercise.
3. **The Hono route signatures** — the RPC type surface. Because
   the web tier consumes these as inferred types, fixing the
   _signatures_ (ahead of the handler implementations) lets the
   SPA build against typed mocks.

All three are already specified in enough detail to land on day
one. Treat them as the first deliverable.

---

## Dependency tiers

```
TIER 0  (serial backbone — blocks everything)
  T0.1 pnpm workspace + tooling (tsconfig, Biome, Vitest, build, dev runner)
        │
        ├── T0.2 shared/ Zod schemas        ◀── the contract seam
        ├── T0.3 DB: Kysely + WAL + migrator-at-startup + initial-schema migration
        └── T0.4 Daemon skeleton: env/config, encrypt/decrypt seam, Hono, /healthz,
                 graceful shutdown, systemd unit

TIER 1  (server building blocks — fan out after Tier 0)
  S1 Operator-type registry framework (register / contractFor / runOperator dispatch)
  S2 Write patterns (enqueue, operator-save + withPipelineEditLock, settlement, claim)
  S3 Pipeline validation (DAG / cycle / single-producer / contract)   ── pairs with S2
  S4 Metered client + Limits (per_window / per_message, retry, metering)
  S5 Gmail client + Provider (History API, fetch, apply_category, threads)
  S6 OAuth flow (/start, /callback, PKCE, token storage / refresh, re-auth)
  S9 HTTP route groups (per-area; read routes need only T0.3)

TIER 1.5  (operators — leaf work, gated only on S1 + their resource client)
  O1 Rule-based Tagger (S1)        O2 LLM Tagger (S1 + S4-bedrock)
  O3 Apply Category (S1 + S4 + S5) O4 Notify (S1 + S4-pushover)
  O5 Digest delivery (S1 + S4 + scheduler)  ← M5

TIER 1-integration  (chokepoints — assemble; cannot finish before their inputs)
  S7 Execution loop + worker pool   needs S1, S2, S4
  S8 Poll loop + scheduler          needs S5, S2

TIER 2  (web — fan out after W0 + frozen route signatures)
  W0 Shell: TanStack Router, sidebar, theme, shadcn/Tailwind, RPC client, Query
  W1 Accounts + OAuth   W2 Pipelines + Operator editors   W3 Inbox + Message detail
  W4 Dashboard   W5 Activity Log   W6 Settings   W7 Metrics stub
```

---

## What can run in parallel

| Stream                       | Members                                                                                            | Gated on                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Server blocks**            | S1, S4, S5, S6, S9 read routes                                                                     | Tier 0 only — 4–5 independent streams                                    |
| **Operator library**         | O1, O2, O3, O4                                                                                     | S1 + each operator's resource client                                     |
| **Web track**                | W0, then W1–W7                                                                                     | frozen route signatures — runs concurrently with the entire server track |
| **Deployment prerequisites** | Google OAuth client, Bedrock IAM + inference profile, reverse-proxy `/oauth/callback` + DNS + cert | nothing — start immediately                                              |

The web track does not wait on the M1 soak. The moment the Hono
route _types_ are committed, the shell and the read-side pages
(W3/W4/W5) build against mocked RPC alongside the M1 runtime
work. The milestone plan sequences go-live, not build start.

The deployment prerequisites have real lead time (Google
consent-screen Production status, certificate issuance, proxy
path-allowlist) and zero code dependency. Started late, they
become the critical path.

---

## What cannot run in parallel (critical path)

1. **T0.1 → the Tier-0 contract trio.** Everything downstream
   inherits its shape. Within the trio, T0.2 / T0.3 / T0.4 can
   overlap once T0.1 lands, but the tier as a whole is the
   bottleneck — staff it first and get it solid.
2. **S7 (execution loop) and S8 (poll loop) are integration
   chokepoints.** They can be scaffolded against the S1/S2/S4 and
   S5/S2 interfaces early, but they cannot _finish_ until those
   land. They are where the parts get assembled.
3. **The M1 silent-Triage vertical** (Gmail read → enqueue →
   LLM-tag → persist, no Actions) is a serial assembly + 24h soak
   even though its parts were built in parallel. This is
   deliberate: it proves the runtime before anything can touch
   the mailbox or the User's phone.
4. **S2 and S3 are coupled** — validation runs inside the
   operator-save transaction. Treat them as one stream.

---

## Overlay on the milestones

The milestones stay the go-live / soak spine; the streams above
are how the build reaches each one.

| Milestone | Build content                                                                    |
| --------- | -------------------------------------------------------------------------------- |
| **M1**    | Tier 0 + S1, S2, S3, S5, S6, S7, S8 + O1, O2. Most of the hard runtime.          |
| **M2**    | S4 completion (Pushover + Gmail-mutate clients) + O3, O4 + Limits enforced live. |
| **M3**    | W0 + W3, W4, W5 + S9 read routes. _(W0 is buildable during M1.)_                 |
| **M4**    | W2 editors + S2/S3 write routes wired to the UI + Limit-config UI.               |
| **M5**    | O5 + scheduler digest path + W2 digest-config page.                              |

---

## Pre-build flags

- **Encryption-key env contract.** The secret-custody _principle_
  is decided in
  [`docs/decisions/grinbox-secret-delivery.md`](../../../docs/decisions/grinbox-secret-delivery.md)
  (host-bound delivery); the _transport_ is deferred, but that is
  a deployment concern. Application code needs only the
  `encrypt` / `decrypt` seam over a key read from the environment
  at startup. Pick the env-var name as part of T0.4 so the daemon
  skeleton and the OAuth flow (S6) agree.
- **Greenfield workspace.** `apps/grinbox/packages/` does not yet
  exist; there is no root `package.json` or `pnpm-workspace.yaml`.
  T0.1 is a clean scaffold with no migration baggage.

---

## First check-in: Tier 0 green

The first coherent, committable checkpoint, before any fan-out:

- `pnpm install` succeeds from the workspace root
- all four packages typecheck and build
- Biome lint is clean; Vitest runs (even if mostly empty)
- the initial-schema migration applies to a fresh SQLite file and
  records itself in `schema_migrations`
- the daemon boots and answers `GET /healthz`

At that point the contracts are frozen and the Tier-1 / Tier-2
streams open.
