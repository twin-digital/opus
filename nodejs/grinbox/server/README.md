# @grinbox/server

The grinbox daemon: one long-running Node process that owns the HTTP surface, the
schedule that polls for new mail, the execution of triage work, and the state
store. There are no worker processes, no timer units, and no external job queue.

Grinbox triages a user's mail unasked. A message arrives, a pipeline of operators
runs over it, and what those operators concluded and did is recorded against the
message for the user to read afterwards.

## Running it

The daemon reads everything from `process.env` and holds no configuration file.

```
GRINBOX_DB_PATH=/var/lib/grinbox/state.db \
GRINBOX_TOKEN_ENC_KEY=<32 bytes, base64 or hex> \
node dist/main.js
```

| variable | required | what it is |
|---|---|---|
| `GRINBOX_DB_PATH` | yes | the SQLite file holding all state |
| `GRINBOX_TOKEN_ENC_KEY` | yes | 32-byte key the stored credentials are encrypted under |
| `GRINBOX_HTTP_PORT` / `GRINBOX_HTTP_HOST` | no | the listener |
| `GRINBOX_WEB_DIST` | no | the browser application's built assets; defaults to `web/` beside the entry point's directory |
| `GRINBOX_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | for mailboxes | the mail provider's OAuth client; without them the authorization routes report "not configured" rather than failing to boot |
| `GRINBOX_OAUTH_OPENER_ORIGIN` | no | the origin the callback page posts back to |
| `GRINBOX_BEDROCK_REGION` | for model calls | where model calls go |
| `GRINBOX_OPERATOR_TIMEOUT_MS`, `GRINBOX_WORKER_POOL_SIZE`, `GRINBOX_POLL_SCHEDULER_TICK_SECONDS`, `GRINBOX_DIGEST_SCHEDULER_TICK_SECONDS`, `GRINBOX_DIGEST_TIMEOUT_MS`, `GRINBOX_RECONCILE_INTERVAL_SECONDS` | no | timing knobs |

`main.ts` is the process entry point and the only module with a side effect on
import. The package barrel starts nothing.

### What the daemon asks of its deployment

Two things, neither of which it can check for itself:

- **One reachable redirect.** A registered TLS-bearing address that routes to the
  callback path and is reachable from the browser the user onboards with.
- **Everything else off the network.** The daemon serves its whole interface on
  one unauthenticated listener and distinguishes no path by where the request
  came from. That only the callback path is publicly reachable is something the
  deployment does in front of it.

The encryption key is the deployment's to hold: the daemon neither generates nor
stores it, and asks that it be kept out of any backup of the state and bound to
the host as tightly as the platform allows. A rebuilt machine cannot read
credentials written by the machine it replaced unless the deployment kept that
key and supplies it again.

## What it exposes

One HTTP surface, three groups:

- `/api/*` — the whole of the remote-control surface. The browser application is
  one client of it with no privileged path, and there is no command-line client.
- the browser application's static assets, from the same process.
- `/healthz` — that the process is up and what build it is running. It carries
  nothing about the user's mail.

A client types itself from the routes rather than redeclaring their shapes: the
barrel exports `type ApiRoutes`, and a consumer builds a typed client with
`hc<ApiRoutes>(baseUrl)`. The value vocabulary inside those envelopes —
operator configurations, enums, the contract skeleton, the refusal body — lives
in `@grinbox/shared`, which both tiers depend on.

A refused write answers in a structured form naming what was wrong and where,
rather than a sentence for a human to read.

## How a message gets triaged

```
poll → ingest → enqueue a triage → run its operators → settle
```

**Polling** is incremental against a cursor stored per account, and an account is
polled only while a pipeline is active on it. Within a cycle every message record
and every triage it enqueues is committed before the cursor moves, and the
cursor's advance is the last write — a crash anywhere before it leaves the cursor
where it was, so the next poll sees the same candidates and recognises them as
already held. A periodic whole-mailbox reconcile corrects where a message stands
on the backend, which the incremental feed cannot see.

**A triage** is one application of a pipeline to one message. It is the unit
everything hangs off: every tag produced, every operation attempted, and the
outcome belong to a triage. A message may be triaged more than once — when it
arrives, and again whenever the user asks — and each of those is its own triage
starting from an empty tag set. No triage reads another's tags.

**A pipeline is a set of operators and nothing else.** An operator takes declared
inputs, produces zero or more tags, and invokes zero or more declared resource
operations. The familiar shapes — a tagger that only produces tags, an action
that only reaches outside — are patterns over that one primitive.

The user never states an order. An operator runs once every input tag key it
declares is present, and the graph that results — producers to consumers, by tag
key — is what the runtime follows. What an operator declares is derived from its
configuration by the code rather than stored alongside it.

**A failure does not fail the triage.** Operators that declared a failed
operator's output as an input are skipped; operators independent of it run
normally; the triage settles partial. There is no retry within a triage — the
retry is the next triage, which is safe to take because re-triage cannot repeat
an outside effect.

When a triage is enqueued it captures, per operator, the type, the code version,
and the configuration in force at that moment, and runs against that snapshot.
Editing an operator never changes a triage already in flight, and a historical
outcome resolves to the exact configuration that produced it.

## Reaching outside

Everything the daemon does outside its own process is an operation on one of an
enumerated set of resources. An operator is handed, per declared resource, a
client exposing exactly the operations it declared — an undeclared operation is
not a method on what it holds, so confinement is by construction rather than by
check.

Every such operation is capped. Grinbox seeds a cap for every operation it caps,
and **those seeded caps cannot be removed or loosened by anyone**: the API
refuses to edit or delete a `seeded` limit, and the seeder reinserts one that
goes missing on the next start. A user adds caps of their own on top — a stricter
bound on an operation already capped, or a bound on one not yet capped — and may
remove what they added at any time, leaving the seeded cap standing. Where
several caps bind one operation, the first to deny denies.

A cap counts operations attempted, not calls made: retries within one operation
belong to the operation that spent the cap. An operation a cap denies returns a
distinguishable outcome — capped, as against succeeded or failed — and the
operator chooses what to make of it, most treating it as a clean no-op. Per-message
caps are what make re-triage safe: the counter is already spent.

## The mail backend

A backend meets the daemon at two seams and nowhere else:

- the **provider** carries the poll path — enumerating candidate messages,
  fetching a message's metadata, applying a category, reporting a message's place
  in its thread, and taking a whole-mailbox snapshot for the reconcile.
- the **resource backends** carry what an operator's declared operations reach:
  archiving, fetching a body, and sending mail.

A backend implements both, and declares which operations it supports rather than
having a caller discover it when one fails. Nothing outside these seams names a
backend: what the user configures about triage, the triage a message receives,
and the record kept of it are expressed in terms no backend owns.

Nothing grinbox does to a mailbox loses mail. Applying a category adds one
grinbox-owned marker and touches nothing else; archiving removes the message from
the inbox and nothing more. No built-in action deletes a message, and grinbox
keeps its own record of a message whether it is still in the inbox or has left
it.

## Credentials

Secrets divide by who obtains them. Those identifying the application itself —
the encryption key, the mail provider's client secret, the model service's
credential — arrive as deployment configuration and are never written into the
state. Those the user obtains through grinbox — a mailbox's tokens, a
notification service's key — live in the state, encrypted, and never reach the
deployment.

Nothing the daemon holds on the user's behalf comes back out of the API. The
credential surfaces answer with what identifies a stored credential — what it is
for, when it was stored, whether it still works — and never the stored material,
in any encoding, by any route.

Authorization begins inside the interface, which mints a single-use short-lived
correlation token, and completes at the one publicly reachable path, which refuses
any request not carrying a token it is still waiting on. Renewal stores whatever
the provider hands back, a replacement durable credential included. Where the
provider refuses to renew at all, the account is marked as needing the user's
attention and polling skips it until they authorize it again.

## The digest

Every judgement about a message — which digest it belongs in, what is worth
pulling out of it — is made when that message is triaged, by ordinary operators.
The scheduled run makes none: it selects, groups, renders, and sends. That
division is what makes accounting for every covered message a property of the
code rather than an instruction something is trusted to follow.

A delivery covers the messages taken in after the last delivery that completed
and up to the moment this one was claimed, and **the whole of that window is
accounted for**: shown in a section, or reported as a count naming why it was not
shown. Mail in a category no section claims, mail the item bound cut, and mail
whose triage recorded no category at all are each counted and attributed. Mail a
sibling edition claims is left to that edition's own delivery, and mail on the
slotting tag's fallback value means never digested. The run asserts that sum
against the window's own size and fails rather than sending a digest that lost a
message.

Only a completed delivery moves the watermark, so a failed or missed delivery's
window is absorbed into the next one rather than lost. Occurrences missed while
the daemon was down collapse into one on return.

## Working on it

```
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # vitest, colocated *.test.ts
pnpm lint
pnpm dev         # tsx watch src/main.ts
```

`pnpm lint` needs more heap than node's default on this package — run it as
`NODE_OPTIONS=--max-old-space-size=8192 pnpm lint` until the shared script
carries the setting.

Per-package config (`eslint.config.js`, `tsconfig*.json`, the `package.json`
scripts and devDependencies) is generated by `pnpm sync` from the root
`.repo-kit.yml` — edit that, not the generated files. The `exports` map is
hand-written: the barrel is the whole importable surface, so the package opts out
of the generated subpath wildcards.

### State

All state is one SQLite file, opened when the daemon starts and held for the
process lifetime. That file is the whole of what must be backed up.

Schema changes are forward-only migrations under `src/migrations/`, registered in
`src/migrations/index.ts` — a static map rather than a directory read, so the
build's layout does not matter at runtime. Keys sort into application order by
their timestamp prefix.

`better-sqlite3` is a native module. The workspace allows its install script so
local development and CI can build it; a release bundle ships no compiled binary
and the deployment installs it on the target for the target's Node ABI.
