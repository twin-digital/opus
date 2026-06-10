# Grinbox implementation plan

Milestone sequence from zero to MVP. Each milestone is sized so the
system is in a coherent, shippable state at every checkpoint — no
half-built intermediate state where the Daemon exists but doesn't
work.

References: [architecture](architecture.md), [glossary](glossary.md).

---

## MVP scope

A Grinbox install that:

- Watches one Gmail Account
- Runs a configured Pipeline of Operators (at least one LLM Tagger
  and one Rule-based Tagger)
- Categorizes Messages via Apply Category
- Notifies the User on important Messages via Notify (Pushover)
- Delivers a daily summary via Digest delivery
- Lets the User browse Triage history and edit Operator
  configurations through a web UI

What's explicitly **not** in MVP is enumerated in
[architecture.md — Out of scope for MVP](architecture.md#out-of-scope-for-mvp)
and listed again in the [Post-MVP backlog](#post-mvp-backlog) below.

---

## Milestones

### M1 — Daemon skeleton + silent Triage

Stand up the Node Daemon end-to-end against a real Gmail Account.
Get LLM Tagging working through the Pipeline. Persist Tags to the
State DB. Do not invoke any Actions — Tags accumulate, nothing
happens to Messages or to the User.

**Deliverables**

- Daemon process, systemd unit, HTTP `/healthz`
- Gmail Provider with OAuth onboarding (flow in
  [oauth-flow.md](oauth-flow.md))
- LLM Tagger using Bedrock-hosted Claude
- State DB with schema for Operators, Tags, Triage history
- In-process scheduler polling Gmail at a configured cadence
- Pipeline executor with Operator-graph topological sort

**Exit criteria**

- New mail in the watched Account is Triaged within one poll cycle
- Tags appear in the State DB with correct keys/values
- Daemon logs show Triage activity; no errors over a 24h soak
- No Pushovers sent; no Gmail Categories applied

This milestone proves the bones of the system before touching
anything that can affect the User's mailbox or phone.

**Operational notes (from v1)**

- **Bedrock inference profile required**: Claude Haiku must be
  invoked through the `global.` cross-region inference profile ARN
  (e.g. `global.anthropic.claude-haiku-4-5-...`), not the bare
  foundation-model ARN. Bare invocation fails with `on-demand
throughput isn't supported`. The `global.` profile carries no
  pricing premium.
- **Bedrock IAM**: the Daemon's principal needs
  `bedrock:InvokeModel` against both the foundation-model ARN and
  the inference-profile ARN (use `*` for region — `global.` routes
  cross-region). It also needs `aws-marketplace:Subscribe` and
  `aws-marketplace:ViewSubscriptions` (`Resource: "*"`) so Bedrock
  can complete the marketplace subscription in any region the
  inference profile routes to. Without these, calls fail
  intermittently with a 403.
- **Gmail OAuth refresh tokens** expire after 6 months of disuse.
  Active polling keeps tokens alive; if an Account is configured
  but the Daemon is offline that long, the token must be
  re-bootstrapped via an interactive OAuth flow.
- **Scheduler cadence**: v1 polled every 10 minutes. Sane starting
  default for M1.

---

### M2 — Action layer

Add Apply Category and Notify Actions. Wire Limits to enforce
caps on Resource operations.

**Deliverables**

- Apply Category Action (declared Resource operation:
  `gmail_api.apply_label`)
- Notify Action (declared Resource operation:
  `pushover_api.send_notification`)
- Limit enforcement keyed on Resource operations, with both
  `per_window` and `per_message` scopes
- Initial Operator configurations seeded via the UI (or a
  one-time bootstrap script) — Mailminder was a PoC, not a
  parallel-running system, so no rule-import path is needed.
  When Grinbox is stable, Mailminder gets turned off.

**Exit criteria**

- Push notifications flowing for new important mail
- Gmail Categories applied to new mail per the Rule-based Tagger
  output
- Limits visibly enforced (logs show capped Resource operations
  when load spikes)
- 24h soak with the full Action set, no Daemon crashes or
  unexpected failures

**Starting Limit defaults (from the Mailminder PoC)**

These are the caps that kept the PoC stable through ~6 months
of live operation. Translated to Grinbox's
`(resource, operation, scope)` Limit shape; revisit after a
soak period.

- `pushover_api.send_notification` `per_window`: max 10 per
  600s (matches v1's per-scan cap given the 10-minute scheduler
  cadence)
- `pushover_api.send_notification` `per_message`: max 1
  (Notify dedupe — see below)
- `gmail_api.apply_label` `per_window`: max 100 per 600s
- `gmail_api.send_message` `per_window`: max 5 per 86400s
  (Digest delivery + margin)
- `gmail_api.send_message` `per_message`: max 1
- `llm_bedrock.invoke_model` `per_window`: max 50 per 600s

Not currently a Limit (handled outside the Limit mechanism):

- **LLM token / cost budget** — v1 had a daily token budget;
  Grinbox's Limit mechanism counts operations not tokens. If
  needed, add as a separate cost-budget mechanism post-MVP.
- **Candidate window** (skip Messages older than N days) —
  enforced at the Provider's `list_candidates` query, not a
  Limit row.

The `pushover_api.send_notification` Limits are the most
load-bearing: an early Mailminder regression sent 408 Pushovers
in 3 minutes against a real inbox. Never weaken these without
an independent backstop.

**Notify dedupe (replaces v1's "frozen at notify-time" pattern)**

The `pushover_api.send_notification` `per_message` Limit
(`max_count=1`) is dedupe. The first Triage's Notify increments
the per-Message counter to 1; subsequent Triages (replay,
future scheduled re-Triage) see the counter exhausted and get
`skipped_by_limit`. No `notified` Tag, no hybrid Operator
pattern. To force re-Notify on a Message, post-MVP UI exposes a
"reset per-Message Limits" affordance.

---

### M3 — Read-only web UI

Single-page React app served from the Daemon. No editing yet —
inspection only. The UI is the operator's new window into the
Pipeline, replacing the SSH + ad-hoc SQL queries that operating
Mailminder required.

**Deliverables**

- Triage browser: paginated list of recent Triages with filters
  (account, time range, presence of specific Tags)
- Message detail view: shows raw Message metadata, all Tags
  produced, which Operators ran, which Resource operations fired
- Operator config viewer: read-only display of the configured
  Pipeline
- Limits dashboard: current Limit usage and recent caps

**Exit criteria**

- The operator can answer "why was this Message tagged / notified
  / categorized" entirely from the web UI without SSH
- No write surfaces yet — UI is observational only

---

### M4 — Operator editing

Web UI gains the ability to edit the Pipeline. Initially scoped to
Rule-based Taggers (the most-changed Operator type) with live
preview against recent Triages.

**Deliverables**

- Rule-based Tagger editor: edit Rule list, reorder rules, edit
  Fallback
- Live preview: evaluate draft Rule list against the last N
  Triages and show diff (which Messages would change Tags)
- Save flow: atomic Operator config update, Operator graph
  re-validation, refusal to commit invalid configurations
- Limit configuration UI: edit per-Resource-operation caps

**Out of M4**

- LLM Tagger prompt editing (deferred — prompts edit in source for
  now; revisit after M5)
- Operator graph reorganization (adding/removing Operators via UI)

**Exit criteria**

- An operator can edit a Rule-based Tagger, preview the impact
  against recent Triages, and save — all from the browser
- Invalid saves are rejected with clear errors
- The operator no longer needs to redeploy to change rules

---

### M5 — Digest delivery

Daily summary email. Sonnet (or equivalent) composes a digest from
Messages whose Tags satisfied the Digest delivery Action's
Contract, sent to the User's own inbox via the Gmail send API.

**Deliverables**

- Digest delivery Action (declared Resource operations:
  `llm_bedrock.invoke_model`, `gmail_api.send_message`)
- Scheduled trigger (in-process scheduler)
- Summarization model integration
- Dedup against prior digests (a Message that appeared in
  yesterday's digest does not reappear in today's)
- Web UI: digest configuration page (schedule, included Tag
  criteria, preview last/upcoming digest)

**Exit criteria**

- Daily digest lands in the configured inbox at the configured
  time
- Digest content reflects the Tags from the prior 24 hours
- Duplicate inclusion of any Message across digests is prevented

---

## Post-MVP backlog

Captured here for visibility; not on the critical path. Order is
not committed.

- **IMAP Provider** — bring non-Gmail accounts under the same
  Pipeline. Provider abstraction already accommodates this; only
  the concrete implementation is needed.
- **Snooze** — operator-initiated "remind me in N days" deferral on
  a Message. Affects Notify's Contract.
- **Feedback** — operator-supplied corrections on Tags, queued for
  the next prompt-tuning iteration. Affects the LLM Tagger
  developer workflow more than the runtime.
- **Multi-user** — authentication, per-User scoping enforcement,
  session management. Schema already designed-for; runtime
  enforcement is the open work.
- **Additional notification channels** — Slack, Discord, email,
  web push. New Side-effect kinds and corresponding Action types.
- **LLM Tagger UI editor** — edit prompts and Contracts from the
  web UI rather than from source.
- **Public-facing deployment** — TLS, OAuth login, hosting outside
  a trusted network.
