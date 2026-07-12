# lock-link — future architecture & deferred features

Enhancements deliberately **out of scope for MVP**, collected here so the architecture
docs stay focused on what ships. Each is a considered deferral, not a backlog dump — the MVP works
without them.

## Fault-aware early warning

**MVP behavior:** the "no code deliverable" alert fires early only on hard sendability blockers
(closed thread); a **lock fault** (offline / jammed) that would break the fallback code too has
no early trigger on the delivery path.

**Status:** the heads-up itself is substantially covered by the monitoring leg's lock-health
sampler and its unhealthy-lock-before-arrival business warning
([architecture-monitoring.md](./architecture-monitoring.md#lock--hub-health)). What remains for
the delivery era: treat a lock fault that also invalidates the room's fallback code as an
**early "no code deliverable" trigger** for affected bookings — a fault-aware escalation rather
than a standalone hardware warning.

## Configurable re-alerting

**MVP behavior:** each alert condition fires **once per booking** and never repeats
([architecture-monitoring.md → Notifications](./architecture-monitoring.md#notifications--escalation)), because there
is no way to acknowledge, pause, or clear an alert — so re-firing would be unmanageable noise.

**Future:** repeat unresolved alerts on a severity-scaled cadence, with the operational controls
that make repetition safe:

- Per-severity re-alert intervals (the retired `LL_REALERT_{CRITICAL,WARNING,INFO}_MINUTES`
  knobs — critical repeats often, info rarely), gated statelessly by the same
  `epoch(scheduledTime) % INTERVAL < TICK` mechanism as the Lynx tiering.
- Severity **upgrade** re-fires — reintroduce a criticality threshold (a `CRITICAL_HOURS`-style
  knob, removed from MVP) so a booking worsening as arrival nears escalates warning → critical,
  detected by threshold-crossing so it isn't silenced.
- An **acknowledge / pause / clear** mechanism (the missing piece) so a handled alert stops
  repeating — otherwise re-alerting is worse than silence.

## Fallback-delete auto-retry

**MVP behavior:** `removeSecondaryUser` is one-shot; an API error raises an ops alert and stops
([architecture-delivery.md → Write discipline](./architecture-delivery.md#the-pool-reconciler)).

**Future:** a **stateless** bounded retry — derive the attempt count from the scheduled tick time
(the same modulo trick), retry the delete a configurable number of times across reconciler
passes, then raise the ops alert only if it still fails. Adds a retry-budget config knob and a
distinct "delete retries exhausted" alarm path. Deferred because delete errors are expected to be
rare and an immediate alert is adequate for the launch volume.

## Best-effort code freshness at send time

**MVP behavior:** codes are assumed static once captured; a `key_code` already set is never
re-checked against Lynx ([architecture-delivery.md](./architecture-delivery.md) — and see its drift register: the monitoring leg's capture verifier already re-checks).

**Future:** before messaging, re-check Lynx and use the fresh code if reachable, the captured one
if not — closing the (expected-anomalous) window where a code rotates in Lynx after capture.
Best-effort so it never reintroduces a Lynx dependency on the send path.

## Unlock-activity monitoring

Poll Lynx's `logActivity/getActivities` (unlock events, including which user unlocked) for
**fallback-code usage outside its expected window** — alert the business and deactivate the
user's code. This is also the only available signal that a "deleted" code is still live on a lock
(the residual-access window the reuse policy otherwise just accepts). Endpoint known, not yet
captured (see [lynx-api.md](./lynx-api.md)).

## Lodgify webhooks as a second watch path

Instant new-booking detection isn't valuable on its own (we wait on Lynx provisioning
regardless), but a new-booking webhook could kick off a tighter watch loop — short-interval Lynx
re-checks — for bookings arriving soon or already past check-in, cutting the one-tick detection
delay when it matters most. Needs the same contract-proving treatment the messaging API got.

## Operational maturity

- **Per-property Lynx error isolation** so a single-property outage doesn't abort the whole tick
  — tracked as opus#201.
- **Parameterize (or remove) the hardcoded alert email** in the stack once the shared
  cross-workload SNS topic exists — tracked as opus#202.
- A **`cdk diff` step on PRs** plus a **`production` approval gate** — deploy-maturity adds.
