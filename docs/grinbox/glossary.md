# Grinbox glossary

Stable vocabulary for Grinbox. Use these terms across design
discussions, code, and docs.

Grinbox is the next-generation successor to Mailminder (in
maintenance). Mailminder code and history live under
`apps/mailminder/`.

The name: _the smile when your email doesn't overwhelm you._

When a Grinbox term and a common English meaning conflict, the
Grinbox meaning wins inside the project. The doc has two parts:

- **Core** — cross-cutting concepts that any Grinbox install has,
  regardless of which Operators are configured.
- **Built-ins** — concrete Operator types (Taggers and Actions)
  that ship with Grinbox.

Terms are grouped by area and listed alphabetically within each
group, except where dependent definitions are clustered with
their parent (Rule, Rule list, and Fallback appear under
Rule-based Tagger).

---

# Core

## Email & Accounts

**Account.** A configured mail backend instance — e.g. a Gmail
account or an IMAP mailbox. Owned by a User; has credentials, a
Provider type, and an optional active Pipeline. Without an active
Pipeline, the Account is not polled and no Triage runs against
it.

**Category.** Durable metadata attached to a Message on its
backend, visible in the user's mail client and persisting outside
Grinbox. The cross-backend abstraction: on Gmail-style backends
this maps to native labels (a Message can carry many); on IMAP
backends it maps to folders, or to RFC-5788 keywords if the
server supports them. Distinct from a Tag: a Tag lives only
inside Grinbox and is read/written by Operators in the Pipeline;
a Category is backend-owned metadata Grinbox can apply but does
not own the lifecycle of.

**Message.** A single email. Identified by
`(account, message_id)`. The Pipeline operates on Messages.

**Provider.** The Grinbox-side adapter to a backend (Gmail, IMAP,
etc.). Each Provider implements list-candidates, fetch-metadata,
apply-Category, and Thread-membership operations against its
backend.

**Thread.** A backend-defined grouping of related Messages (a
conversation). Whether a Message is part of a Thread — and its
position within one — is available as input to Operators.

**User.** A person with a Grinbox identity. Owns one or more
Accounts; their incoming Messages are Triaged by the Pipeline,
and user-facing outcomes (notifications, digests) are delivered
to them.

---

## Operators

**Contract.** The declaration on each Operator specifying its
required input Tag keys (the full Message is always available),
its output Tags (each a key + a permitted value enum, all
required when the Operator runs), and the Resource operations
it will invoke. The Pipeline uses Contracts to order execution:
an Operator runs only when all its declared input Tag keys are
present on the current Triage.

**Operator.** The Pipeline primitive. Given declared inputs
(upstream Tag keys plus the full Message), an Operator produces
zero or more output Tags and/or invokes zero or more declared
Resource operations. The two common shapes are **Tagger** and
**Action** — see their entries.

**Operator run.** A single Operator's execution within a Triage.
Each Operator run has a durable state in the State DB —
`pending` (not yet evaluable), `running` (currently executing),
`completed`, `failed`, or `skipped` (a declared input Tag will
never arrive because its producer terminated without producing
it). The execution loop advances Operator runs as their inputs
become satisfied.

**Operator version.** The
`(type, code version, configuration)` snapshot of an Operator
captured when a Triage enqueues runs for it. The Operator's
current configuration is mutable, but each Triage's runs
preserve what was active at enqueue, so historical Tags resolve
to the exact (type, code version, config) that produced them.

**Tag.** A `{key, value}` pair produced by a Tagger during a
Triage. Values are strings drawn from the producing Tagger's
declared enum for that key — boolean-like Tags are 2-value enums
(e.g., `is_vip: "yes" | "no"`). Tags are scoped to the Triage
that produced them; the "current Tags on a Message" is the
output of the latest-started, settled Triage for that Message.
Distinct from a Category (which is backend-side metadata
visible in the mail client).

**Tagger.** An Operator that produces one or more declared
output Tags and invokes no mutating Resource operations (it may
still invoke read-only or metered operations like LLM calls).
May be LLM-backed or deterministic. The most common Operator
type — most Messages flow through several Taggers before any
Action's Contract is satisfied. Concrete Tagger types ship in
Built-ins.

---

## Actions & Resources

**Action.** An Operator that performs one or more Resource
operations (typically without producing Tag outputs). When its
Contract inputs are satisfied by a Triage's Tags, the Resource
operations fire. Multiple Actions can fire on the same Message
— e.g., notify the user _and_ add to the digest. Concrete Action
types ship in Built-ins.

**Limit.** A non-negotiable backstop on a Resource operation's
frequency or per-Message count. Scoped either to a rolling time
window (`per_window`, e.g., 10 notifications per 600s) or to a
single Message (`per_message`, e.g., at most 1 notification per
Message). When hit, the operation is silently skipped.
Per-Message Limits are how dedupe across Triages works:
re-Triaging a Message doesn't re-fire Actions because the
per-Message counter is already exhausted.

**Resource.** A consumable API or service an Operator interacts
with — e.g., `llm_bedrock`, `gmail_api`, `pushover_api`. Each
Operator declares the Resources it uses (and the specific
operations it will invoke on each) in its Contract.

**Resource operation.** A specific operation a Resource exposes
— e.g., `gmail_api.fetch_metadata`, `gmail_api.apply_label`,
`pushover_api.send_notification`, `llm_bedrock.invoke_model`.
Operations are the unit of Limit enforcement and of metering.

---

## Pipeline & Triage

**Pipeline.** A named bundle of Operators configured by a User.
Operators within a Pipeline form a directed acyclic graph via
their Contract input/output dependencies — execution order falls
out of who consumes whose Tags. Each Account may be associated
with at most one Pipeline; only Messages on Pipeline-associated
Accounts are Triaged. A User may have many Pipelines.

**Triage.** The act of applying a Pipeline to a single Message.
Used both as a noun ("the Triage produced these Tags") and as a
verb ("Triage this Message"). Happens automatically when a
Message is ingested (a "live" Triage) or on-demand to re-evaluate
a Message later (a "replay" Triage).

**Triage event.** Something that happened during a Triage that
the User can see in the Message-detail view — a Tag was set, a
Resource operation succeeded, a Resource operation was skipped
by a Limit, an external call failed. Operator state transitions
(pending → running → terminal) are tracked separately on the
Operator-run record; they're not Triage events.

---

## Application

**Daemon.** The long-running Node process. Owns the HTTP server
(API plus static SPA), in-process scheduler, and the Pipeline. A
single service; no separate timers or worker processes.

**State DB.** The single SQLite file holding all persistent
state — Tags, Operator configurations, Triage history, etc.

---

# Built-ins

Concrete Operator types that ship with Grinbox. Each is one
realization of the abstract Operator concept in Core.

## Tagger Types

**LLM Tagger.** A Tagger backed by a hosted LLM (currently
Bedrock-hosted Claude). Inputs are templated into a system
prompt; the LLM is constrained to produce values from the
Contract's declared enum for each output Tag key, via
structured-extraction validation. A single LLM call produces
all of the Tagger's declared output Tags together (this is the
main reason to use an LLM Tagger over multiple Rule-based
Taggers — one model call, many Tags).

**Rule-based Tagger.** A deterministic Tagger that produces
exactly one output Tag by evaluating an ordered Rule list. The
output Tag's key and value enum are fixed by the Contract; each
Rule emits one value from that enum. Useful for derived Tags
where deterministic evaluation is more reproducible than an LLM
(urgency is the typical example).

**Fallback.** The required default output value for a
Rule-based Tagger, applied when no Rule in the Rule list matches.
It is a dedicated field on the Tagger's configuration — not a
Rule with a wildcard `match` — which guarantees by construction
that the Tagger always produces its declared output Tag,
satisfying the Contract regardless of the Message's inputs. (A
literal `*` match expression inside the Rule list is rejected;
the default lives only in the Fallback field.)

**Rule.** A single `match → output` entry in a Rule list. The
`match` is an expression over the Tagger's declared input Tags
and any Message field; the `output` is one of the values from
the Tagger's declared output enum. First match wins.

**Rule list.** The ordered sequence of Rules a Rule-based Tagger
evaluates, first match wins. Paired with a required Fallback
that supplies the output when no Rule matches.

## Action Types

**Apply Category.** The Action that adds a Grinbox-owned
Category to a Message on its backend. Declared Resource
operation: `gmail_api.apply_label` (and the equivalent for other
backends).

**Digest delivery.** The daily Action that composes a summary
of Messages whose Tags satisfied its Contract, via the
summarization model, and sends it as an email to the user's own
inbox. Declared Resource operations:
`llm_bedrock.invoke_model`, `gmail_api.send_message`.

**Notify.** The Action that sends an out-of-band push to the
user (currently via Pushover). Declared Resource operation:
`pushover_api.send_notification`. Dedup across Triages is
handled by a per-Message Limit on this operation (default 1).
