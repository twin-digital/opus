# lock-link — architecture & design

`@twin-digital/lock-link` delivers smart-lock door codes to guests booked through **Lodgify**
(short-term-rental PMS / channel manager), sourcing the codes from **Lynx** (the smart-lock
management system).

**Why it exists:** Lynx is supposed to do this itself — it generates per-reservation codes and
emails them to guests. In practice its delivery is unreliable, especially for OTA guests behind
relay addresses (Expedia, Booking.com), and Lynx support was unable to resolve it. lock-link
gives the property manager **reliable, observable door-code delivery**, sending through
Lodgify's messaging so every guest conversation stays in the unified inbox. Owning the message
(rather than letting Lodgify's "X days before arrival" templates deliver a code field) is also
what makes two things possible: carrying a **different code per lock** on one reservation — a
requirement Lynx imposes by not guaranteeing code uniformity, not a feature we set out to
build — and **holding delivery until provisioning has actually succeeded** — a template fires on
schedule even when the code isn't ready, worst on last-minute bookings where "1 day before"
means "immediately".

The constraint chain, compactly: commercial locks (DormaKaba) → Lynx is the only middleware that
drives them from a vacation-rental PMS → OTAs structurally block third-party senders (so Lynx's
own emails can't deliver) → Lynx doesn't push codes into Lodgify (so Lodgify's first-class OTA
messaging can't carry them) → the PMSs Lynx does push into have disqualifying OTA gaps → and
no PMS's scheduled messaging will hold a guest message until the code exists (the gating that
exists is bounded — capped holds, retry windows that silently drop — or absent), so late
bookings get blank, stale, or dropped code messages regardless. (The vendor research and the
client proposal that substantiate this chain are tracked separately, in a follow-up.)

**What it does:** a scheduled loop that, per booking —

1. **Captures**: once Lynx reports every lock provisioned, writes the per-lock codes into the
   Lodgify booking's `key_code` field.
2. **Messages**: once arrival is near, sends the guest their codes through Lodgify's messaging
   API, exactly once.
3. **Falls back**: if a booking goes overdue with its code still unprovisioned, issues one of
   the room's pre-provisioned **fallback codes** through the same two steps, so the guest is
   never left standing outside.
4. **Notifies the business** when — and only when — a human action is needed (call the guest,
   ready a fallback, check a lock), on a channel separate from the operational alerts
   engineering receives about system faults.

This document covers the what, why, and when. Endpoint-level contracts, wire shapes, and
provenance live in the per-API references: **[lynx-api.md](./lynx-api.md)** and
**[lodgify-api.md](./lodgify-api.md)**. All integration contracts are proven against live data.

---

## Data flow

**Lodgify-driven, gap-fill.** Drive from the official Lodgify API and touch the unofficial Lynx
API only for actual gaps — Lynx usage scales with new near-term bookings (not calendar size) and
quiesces to **zero** once everything in-horizon has its codes.

```mermaid
flowchart TD
    L["Lodgify: list Upcoming + Current bookings<br/>in horizon, status Booked"] --> G{"key_code set?"}
    G -- "no — a gap" --> R["Lynx: resolve per-lock codes + readiness"]
    R --> RD{"all locks success?"}
    RD -- yes --> W["capture: write encoded key_code"]
    RD -- "no / Lynx unreachable" --> T{"past T0?"}
    T -- yes --> E["issue a standing fallback code<br/>(same key_code write)"]
    T -- no --> S["skip — the schedule is the retry"]
    G -- yes --> M{"inside send window?"}
    W --> M
    E --> M
    M -- yes --> TH{"thread already has<br/>our message?"}
    TH -- no --> SEND["send the guest message"]
    TH -- yes --> DONE["nothing to do"]
    M -- no --> DONE
```

Escalation runs alongside every step: bookings that are overdue and still unmessaged — or whose
guest is unreachable — notify the appropriate audience (see Notifications & escalation).

> [!NOTE]
> **T0** is the instant a booking becomes _overdue_: old enough that provisioning should have
> happened, close enough to arrival that it matters. It triggers both the fallback and
> the first escalation, and it appears throughout this doc — the precise (piecewise) definition
> is in the Timing section.

**Capture and message are decoupled — but pipelined within a tick.** Capture usually runs
days-to-weeks before the send window opens, and once it lands the codes live in Lodgify's own
booking record: at send time the only dependency is Lodgify, so a Lynx outage can delay capture
(the schedule retries it, with lots of slack) but can never block a send. The `key_code` field
doubles as the local store — no separate database; the state rides in the system of record for
the booking itself. Within a single run, each booking flows capture → message in one pass: a
booking that becomes ready inside the send window is messaged in the same invocation, never
parked for the next tick.

**Degraded mode: manual capture.** Capture is the _only_ step that requires the Lynx API. If
Lynx access is ever lost — a breaking change that can't reasonably be accommodated, or access
revoked outright — the system degrades, in order: already-captured bookings message normally
(send needs only Lodgify); the fallback pool keeps issuing without Lynx (the snapshot is
Lynx-independent and the codes are already in the locks — weeks of coverage at observed
same-day rates); and permanently, staff can read codes off the Lynx dashboard and enter them
into Lodgify's key-code field by hand, at which point **everything downstream still works** —
timing, verified sending, read-before-send, delivery tracking, escalation. Total Lynx API loss
reduces the system to "staff type one code per booking," not to nothing.

**The join** between systems is Lynx's `confirmationCode`, which embeds the Lodgify booking id
(`20559349VK222262` → booking `20559349`). A `confirmationCode` that doesn't match the expected
shape escalates — a free integrity check. Mechanics and the Lynx ID model:
[lynx-api.md](./lynx-api.md).

**Statelessness is the design's backbone.** Every run re-derives everything from the two APIs
and the clock: `key_code` empty/set is the capture state, the message thread is the sent state,
and all timing decisions are pure functions of the tick time (see Timing). There is nothing to
migrate, repair, or drift.

**Warm-path memoization.** Statelessness governs correctness, not cost: an invocation may
memoize **immutable facts** in module scope and skip re-reading them while the Lambda stays warm
(typically well past the 10-minute tick). The rule: memoize only **monotonic** facts — a sent
message stays sent; a user's PIN never changes for that user id — never mutable observations
(not-ready, not-sent, standing counts), which are exactly what each tick exists to re-check. A
cold start means an empty memo and a full re-derive: identical behavior, different cost. Applied
where reads are chattiest: the per-booking sent-check (an already-messaged booking skips its
thread read for the rest of the stay) and Lynx user PINs. This also serves a standing
non-functional requirement: **minimize calls to the unofficial Lynx API**.

> [!IMPORTANT]
> **We assume door codes are static once set.** A Lodgify booking that already has a `key_code`
> is treated as captured and never re-checked against Lynx, so a _rotation_ of the code in Lynx
> after capture would not propagate — the guest would be messaged the captured codes. The data
> suggests codes are assigned once and stable. If that proves untrue, add a best-effort re-check
> at send time (a [future enhancement](./future-architecture.md)) or a scheduled reconciliation
> for the in-horizon set.

---

## Timing

Time drives almost every behavior in the system, so it is specified in one place. **Every time
value is env-tunable — no timing constants in code.** The one value that lives in infrastructure
(the EventBridge cron rate) is derived in `stack.ts` from the same constant that sets
`LL_TICK_MINUTES`, so the rule and the Lambda can't drift apart.

| Env var                         | Default | Units   | Governs                                                  |
| ------------------------------- | ------- | ------- | -------------------------------------------------------- |
| `LL_TICK_MINUTES`               | 10      | minutes | Tick rate (stack-derived with the cron rule)             |
| `LL_HORIZON_DAYS`               | 14      | days    | Which upcoming bookings the loop considers               |
| `LL_LYNX_SLOW_MINUTES`          | 60      | minutes | Lynx re-check gate outside the send window               |
| `LL_NORMAL_LEAD_HOURS`          | 24      | hours   | Send window opens; fast-tier polling boundary            |
| `LL_FALLBACK_LEAD_HOURS`        | 4       | hours   | Fallback-issuance lead — the deadline to have a code out |
| `LL_GRACE_MINUTES`              | 30      | minutes | New-booking escalation suppression                       |
| `LL_POST_CHECKIN_GRACE_MINUTES` | 10      | minutes | Tightened grace once check-in time has passed            |
| `LL_FB_HOLD_BUFFER_HOURS`       | 24      | hours   | Issued fallback code protected after departure           |
| `LL_WORKDAY_POOL_CHECK_LOCAL`   | 15:00   | local   | Daily pre-close fallback-pool check (property TZ)        |
| `LL_FB_PENDING_ALARM_HOURS`     | 36      | hours   | Alarm on a fallback create still provisioning            |
| `LL_FB_RECONCILE_MINUTES`       | 360     | minutes | Fallback-pool reconciler gate                            |
| `LL_FB_USE_DECAY_DAYS`          | 60      | days    | Fallback-code uses older than this stop counting         |

Cold-start validation enforces `NORMAL_LEAD_HOURS > FALLBACK_LEAD_HOURS` (the normal-code send window opens well
before the fallback lead), `POST_CHECKIN_GRACE_MINUTES ≤ GRACE_MINUTES` (the system must never get _lazier_ once the guest
may be physically present), and every **interval gate** (`LYNX_SLOW_MINUTES`,
`FB_RECONCILE_MINUTES`) ≥ the tick rate — a gate shorter than a tick would degenerate to
"every tick". The graces are exempt: they are age thresholds, not gates, and may legitimately be
shorter than or equal to a tick (a 10-minute grace on a 10-minute tick simply means the breach
is acted on at the first tick after it).

### The three timing mechanisms

1. **Windows** — pure functions of (tick time, booking timestamps): horizon, send window, fallback lead,
   graces, severity. Recomputed every tick, so a booking's treatment changes as the clock runs
   down with no stored state — an unresolved booking naturally escalates from warning to
   critical as arrival approaches.
2. **Interval gates** — `epoch(scheduledTime) % INTERVAL < TICK` ("the first tick of each
   interval"): the Lynx slow tier and the fallback-pool reconciler cadence. Stateless: the
   schedule is the state; no check timestamps are stored anywhere. Intervals are arbitrary
   tunables — no need to align to hours.
3. **Threshold crossings** — deterministic instants derived from the windows. A booking becomes
   overdue at **T0**, where the applicable grace is `GRACE` before check-in and
   `POST_CHECKIN_GRACE` after: `T0 = max(arrival − FALLBACK_LEAD, created + GRACE)` when that lands before
   check-in, otherwise `max(checkIn, created + POST_CHECKIN_GRACE)`. Note the deliberate
   discontinuity: a booking whose age at check-in is between the two graces breaches _exactly at
   check-in_ — the guest just became present. (For bookings made in advance, `arrival − FALLBACK_LEAD`
   dominates and neither grace matters.) The "no code deliverable" alert fires on the first tick
   with `T0` inside `(previousTick, thisTick]` — once, always critical — with no alert ledger and,
   in MVP, no re-fire (see Notifications & escalation).

All three key off the **scheduled** tick time from the trigger event (`event.time`), not the
wall clock — delivery jitter, cold starts, and async-retry redelivery all resolve to the same
logical tick. Snap the received time to the tick grid for sub-minute wobble. The interval-gate
guarantee is "at most one action per interval"; if that one tick errors out, the interval is
skipped — bounded staleness that never affects in-window gaps (checked every tick regardless).

### Cadence & Lynx tiering

The rule fires every `TICK_MINUTES`, but Lynx re-checks are tiered so Lynx pressure scales with
urgency, not with the clock:

- Gaps **inside the send window** (including past-check-in bookings) → Lynx re-checked **every
  tick**. These are the bookings where readiness latency is guest-facing.
- Gaps **outside the send window** → Lynx re-checked only on the slow-interval gate. A booking
  arriving next week loses nothing by being re-checked hourly.

At steady state (no gaps) even the slow-tier tick makes no Lynx calls; the faster cadence costs
only a Lodgify list read per tick. Worst-case detection latency for a same-day booking is one
tick plus Lynx's own provisioning time.

### Worked example

Booking created **Mon 10:07**, arrival **Thu 16:00** (78 h out), defaults throughout:

- **Mon 10:10** (first tick after creation): enters the horizon as a gap. Outside the send
  window (78 h > 24) → slow tier, Lynx checked roughly hourly.
- **Mon 14:00**: Lynx reports all locks `success` → codes captured to `key_code`. The booking
  idles — messaging isn't allowed yet.
- **Wed 16:00** (T-24 h): send window opens. That tick: thread read → no lock-link message →
  message sent. Done; every later tick sees the message in the thread and does nothing.

Sad-path variant — Lynx never provisions:

- **Thu 12:00** (T-4 h = T0; grace long since passed): fallback breach. This tick issues the
  room's fallback code (written to `key_code`, delivered by the message step) — no alert, because
  a code reached the guest. Only if the fallback **can't** be issued or sent does the single
  "no code deliverable" critical fire here (or earlier, at the normal-code stage, if the thread
  was already closed).
- No alert repeats and none fires at arrival; the standing CloudWatch alarms are the ongoing
  signal if a problem persists.
- Contrast, a late booking created **Thu 14:30** for a Thu 16:00 arrival: born inside every
  window; T0 = created + 30 min = 15:00. If codes sync at 14:52, the 15:00 tick captures _and_
  messages in one pass — nothing ever alerts.

### Post-check-in issuance latency (the rain window)

How long a guest who books **at or after check-in** waits for the fallback, assuming a
standing code is available.

**How to calculate it.** For a booking created at/after check-in, `arrival − FALLBACK_LEAD` is already in
the past, so `T0 = created + POST_CHECKIN_GRACE`. Issuance (and, pipelined, the message) happens
at the **first tick ≥ T0**, which adds anywhere from 0 to one full `TICK` depending on how T0
lands on the tick grid; delivery adds _slop_ (~½–2 min of invoke lag, run time, and email
delivery). So:

```
wait = POST_CHECKIN_GRACE + U + slop        where U ∈ [0, TICK)

floor   = grace + slop            (T0 lands exactly on a tick)
typical = grace + TICK/2 + slop   (uniform tick alignment on average)
ceiling = grace + TICK + slop     (T0 just misses a tick)
```

With the defaults (grace 10, tick 10): **floor ~10½ min, typical ~16 min, ceiling ~20 min +
slop.**

The grace is the floor and the burn-rate knob (every minute shaved is a minute less for Lynx to
provision before a non-expiring code is consumed — see the calibration trade-off below); the
tick is the variance and is nearly free. Guests who book **before** check-in wait less — with
lead time `C` before check-in, T0 follows the piecewise definition above, so:
`C ≥ GRACE + TICK` (≥ 40 min at defaults) → issued before they arrive, zero wait;
`POST_CHECKIN_GRACE ≤ C < GRACE` → T0 lands exactly at check-in, wait = pure tick alignment
(≤ one tick + slop); `C < POST_CHECKIN_GRACE` → wait ≤ `grace − C + TICK + slop`.

### Latency calibration

Lynx keeps no event history (no timestamps on reservations or access codes, and `past`
reservations clear `accessCodes` — see [lynx-api.md](./lynx-api.md)), so provisioning latency
can only be measured by observing it live. The loop therefore emits calibration metrics as it
works: per gap booking, the observed transitions (first seen as gap, first seen ready, captured,
messaged) with the Lodgify `created_at` as the clock-start. **These give an operator the data to
tune the knobs above** — `NORMAL_LEAD_HOURS`, the graces, the tick rate — as real provisioning-latency
distributions emerge; nothing self-tunes. The same-day segment is the one that prices
`POST_CHECKIN_GRACE`: the grace buys rain-minutes at the cost of **fallback-code burn**. If
Lynx's typical same-day provisioning latency exceeds the grace, nearly every booked-at-the-door
guest consumes a fallback code (plus a rotation) that the real code would have overtaken
minutes later — and since an issued reservation is done, the real code never goes out. If typical
latency is below the grace, tightening it is nearly free. A pre-launch baseline — two observed
provisioning latencies and a 60-day booking-timing distribution — is recorded in
[calibration-baseline.md](./calibration-baseline.md).

---

## Readiness

Lock provisioning is **eventually consistent** (Lynx scheduling, lock memory limits, hub comms,
transient errors), so a reservation legitimately spends part of its life only partly
provisioned.

- **Ready** = the reservation's access codes cover **every** lock in the property's lock set,
  each reporting `syncToLockStatus: "success"`. Codes are usually uniform across a reservation's
  locks but **legitimately differ** (observed live 2026-07-07: front door `2968`, back door
  `3350` on one booking) — capture every lock's code; don't require them to match.
- ⚠️ Code _presence_ is not readiness — Lynx assigns the code up front, before it reaches the
  hardware. Only all-locks-`success` is. **Never capture a partial/unsynced code set**: a code
  that opens some doors is worse than none.
- **Not ready is normal**, not an error — skip and re-check next tick. Escalation only enters at
  the breach threshold (see Timing / Notifications).

Wire details (states, the lock-set denominator, drift policy): [lynx-api.md](./lynx-api.md).

## The key_code convention

`key_code` is a free-form string that lock-link owns (single-host deployment; nothing else
writes the field, Lodgify's UI never displays it, and no active message template interpolates
it). Encoding:

- all locks share one code → the bare code, e.g. `9234`
- codes differ per lock → a labeled list, e.g. `Front Door: 2968 · Back Door: 3350`, locks
  ordered alphabetically by `lockName` so the encoding is deterministic

Fallback codes use the same formats — an issued fallback code is indistinguishable in the
field from a normal one (see Fallback access codes; issuance is recorded by the alert and
metrics, not the field). The human-readable form is cheap insurance, not a live requirement: it
costs nothing over JSON, reads cleanly in API responses and debugging sessions, and would render
usably if Lodgify ever surfaces the field or a template is added later.

The **stateless diff** follows from the convention: compare the booking's current `key_code` to
the string we would write, and write only when they differ. Self-correcting, no snapshot store.

## Messaging the guest

The guest message goes through Lodgify's messaging API so it lands in the **unified inbox**
thread (one conversation view for the host) and is delivered onward to the guest — by email, or
pushed through the booking's channel for OTA bookings (documented but not yet observed live:
verify on the first real OTA send).

A booking is messaged when **all** of these hold — the schedule is the retry:

1. **Codes captured** — `key_code` is set (readiness held at capture time).
2. **Inside the send window** — codes are live on the locks the moment Lynx reports success, so
   messaging weeks ahead is a small security/confusion cost with no benefit; the window bounds
   it. Late bookings need no special case: a booking made 2 hours before arrival is born inside
   the window and is messaged on the first tick after capture.
3. **Not already sent** — **read-before-send**: the booking's thread is read and the send is
   skipped if it already contains our message. The check is an exact match on a deterministic
   `message_id` (UUIDv5 of `bookingId:access-codes`) that we set at send time and Lodgify echoes
   back in thread reads. The server also rejects duplicate `message_id`s outright, which
   backstops the one race read-first can't close (crash between send and the next read).

There is **no cutoff at arrival** — attempts continue until checkout (a guest mid-stay without
their codes still needs them; late beats never). Missing the fallback deadline triggers the _escalation_,
never a stop to sending.

**Content**: fixed template, single-host deployment — greeting with the guest's name, property
name, arrival date, and the codes (one line when uniform, a labeled list per lock when they
differ). Plain text.

Delivery is observable after the fact — each message's `message_status` and the thread's
`is_closed` flag surface delivery failures and unreachable guests, which drive the relevant
escalations (see the failure-mode catalog). The v1 send endpoint's wire quirks (HTTP 200 on
failure, error-envelope parsing) are an implementer detail in [lodgify-api.md](./lodgify-api.md).

## Fallback access codes

Each room/unit keeps a **warm pool of standing fallback codes** live in its locks (one code
opens all of the room's locks). When a reservation breaches T0 with its guest code still
unprovisioned, the capture phase falls back to one of the room's standing codes instead of
leaving the guest without access: the code is written to `key_code` using the ordinary encoding
and the **normal message step delivers it** — same thread, same dedup, same template. From the
guest's and the loop's perspective a fallback code is a normal code; only its **source**
differs. Issuance is recorded by the issuance metric and the message itself; it does **not**
alert anyone — alerts fire only when a human action is needed (see Notifications & escalation).

**Issuance is Lynx-independent.** The trigger — gap ∧ past T0 — is computable from Lodgify and
the clock alone, and the pool lookup needs only the booking's Lodgify `property_id`. A failed
Lynx check that tick, a Lynx-wide outage, or a reservation Lynx never received does not block
the fallback — those are precisely the scenarios it exists for.

- **Pool snapshot**: an SSM SecureString (`LL_FB_CODES_PARAM`) holding a JSON map
  of **Lodgify `property_id`** → **list of code objects**:
  `{ "<lodgifyPropertyId>": [{ "code": "1234", "userId": 111111, "createdAt": "…", "assignedBookings": [{ "bookingId": 123, "issuedAt": "…" }] }, ...] }`.
  Terminology matters here because "cache" is overloaded: this is **Lynx pool state snapshotted
  into SSM by the reconciler** so that issuance never needs Lynx; it is _not_ additionally
  cached in Lambda memory — issuance reads the parameter fresh every time (a stale code is the
  one thing worse than a slow read).
- **Selection**: among the room's standing codes that are **not currently assigned**, pick the
  one with the **most uses remaining** (`MAX_USES − effective uses`); break ties by stable
  creation order (the timestamp in the fallback user's name). Preferring the code furthest from
  its limit spreads usage evenly, so codes hit `MAX_USES` later — and, with the decay window,
  uses may expire before any code needs rotating at all, minimizing rotations. "Assigned" is
  derived live: a code counts as assigned while it appears in the `key_code` of any booking with
  `departure ≥ now − FB_HOLD_BUFFER`, so a code straddling a checkout-plus-hold window is
  **never issued to a second guest**.
- **Non-expiry caveat**: unlike guest codes (which Lynx clears at checkout), an issued fallback
  code stays live until the reconciler rotates it after the stay — a guest retains working
  access until then. Rotation is automated; the residual-access risk (Lynx clears the code from
  its DB on delete immediately, but clearing lock hardware is unobservable and may lag) is
  accepted and mitigated by the reuse policy — doing fewer rotations — not by tracking deletes.
- **Failure handling**: breach with **no standing code available** → business-critical (a code
  is needed and none exists) plus an operational alert; the ordinary overdue-unmessaged
  escalation continues regardless.
- Once issued, the reservation is **done** from the loop's perspective — if the real guest code
  syncs later, no follow-up message is sent (the static-codes assumption applies). Anything
  fancier is a manual step.
- **Rejected**: reading PINs from Lynx at issuance time. The fallback must not depend on the
  system whose failure triggered it. (A lock's `erCode` — its permanent base code — is likewise
  never guest material.)

### The pool reconciler

Lynx has **no native feature for pre-created fallback keys** — but it has primitives that
compose into one:

- A Lynx **user** granted access to locks is assigned a **user-specific door code**, programmed
  into every lock the user can access.
- **Locks are organized into groups**; assigning a user to a group grants access to all of that
  group's locks. One group per room. ⚠️ Prerequisite: these room groups must be created in the
  Lynx dashboard first — none are correctly configured yet.
- So each room holds a pool of synthetic **"fallback users"** — accounts associated with no
  human — whose user codes are the standing fallback codes.
- **Issuing** a code = handing one of these users' door codes to a guest. **Rotating** =
  deleting the user, which revokes the code, then creating a replacement. ⚠️ List removal and
  task-code return are observed to be **immediate**, but clearing the code from lock hardware is
  suspected to take longer (minutes-to-hours) and is **unobservable** — no signal exists to
  verify it. That asymmetry drives the reuse policy below: the mitigation for rotation risk is
  **doing fewer rotations**, not detecting failed ones.

Two constraints shape the pool:

- **Task codes.** Every Lynx user with a door code requires a "task notification code" — an
  attribute serving Lynx workflows unrelated to us (housekeeping check-offs; never guest-facing,
  never a door code). They are the scarce creation input: a user **cannot be created without
  one**, assignment removes it from the available pool, deletion returns it immediately, and
  whether anything else creates or consumes them is unknown — so the free list is enumerated
  live, never assumed. Observed budget: 8 — fully subscribed at 4 rooms × target 2 (any room
  can take a last-minute booking; the second code covers the rotation window). Foreign
  consumption makes the target unreachable, which the below-target alarm (rows 22–25 in the
  [failure-mode catalog](#appendix-failure-mode-catalog)) surfaces automatically.
- **Provisioning takes up to 24 h** (empirically often much faster), so **on-demand creation is
  impossible** — 24 h doesn't beat a guest at the door. The pool is kept warm _ahead_ of need;
  create/delete is **replenishment after use**, never issuance.

**Reuse policy — rotation is tunable, not mandatory.** Rotation-by-deletion carries risks
beyond lock memory: frequent user-management events are the kind of API usage most likely to
draw audit attention, and there is an unconfirmed suspicion that code removals trigger manual
verification by Lynx support staff. So how aggressively codes rotate is a knob, trading physical
security (a past guest could regain access) against the risk of destabilizing the lock system:

- **`LL_FB_MAX_USES`** (`number | 'unlimited'`, default **1**): how many guests may
  receive a code before it is rotated. `1` = today's rotate-after-every-use; higher values
  divide the rotation traffic by that factor; `'unlimited'` disables rotation entirely — the
  reconciler makes **zero** user-management writes after initial pool creation.
- **`LL_FB_USE_DECAY_DAYS`** (default **60**): uses older than this stop counting toward
  the limit, on the assumption that a guest from months ago has lost or forgotten the code.
  This turns the limit from a lifetime cliff into a rate — the real security statement becomes
  "at most `MAX_USES` guests within any `DECAY` window know a live code." Irrelevant at
  `MAX_USES = 1`; it is what makes higher values reasonable.
- **Use tracking lives in the pool snapshot**: each code object carries
  `assignedBookings: [{ bookingId, issuedAt }]`. The issuance path appends the entry in the
  same breath as the `key_code` write — an SSM write, so still Lynx-independent — and the
  append is idempotent (set semantics on `bookingId`), so retries can't double-count. Effective
  uses = entries with `issuedAt` inside the decay window; the reconciler prunes older entries.
  The append is the SSM snapshot write that follows the guest-message send; if the Lambda dies
  in the gap between sending and writing (the same rare stateless-retry window as elsewhere), the
  use goes unrecorded and the code under-counts by one. That is a bounded, accepted error — worst
  case one extra guest gets the code before rotation — in a feature that already trades security
  margin for stability.
- Lifecycle consequence: after a stay ends (hold buffer passed), a code with remaining uses
  returns to **standing**; a code at its limit becomes **rotation-eligible** and is deleted and
  replaced.

**Cadence.** The reconciler runs on its own interval gate, `FB_RECONCILE_MINUTES`
(default 6 h) — much slower than the sync loop, because its reads hit the unofficial Lynx API
(minimize-Lynx-calls applies) and nothing in the lifecycle is minute-sensitive. The delay
modeling: a full rotation cycle is `checkout + 24 h hold + ≤6 h detect + delete (immediate) +
≤24 h provision + ≤6 h detect standing` ≈ **under 2.5 days** (there is no delete-confirmation
step — the delete is immediately consistent in Lynx's DB, and lock-hardware clearing is
unobservable), comfortably covered by the room's second code at the observed ~1 issuance/week
account-wide burn. Alarm detection latency
(zero-standing, pool faults) is bounded by the same gate — acceptable for advisory alerts at
these rates.

Each pass **observes everything, stores nothing** beyond the pool snapshot — all endpoints in
[lynx-api.md](./lynx-api.md#user-management--task-codes):

- `getSecondaryUsersList` — what exists; our users are recognized by name prefix
- `getPendingCodeInfoForSecondaryUserLiveCodes` — per-user provisioning (`pendingInfo: []` =
  standing)
- `getSecondaryUserInformation` — the door PIN (`secondaryUserAccessCodeInfo.accessCode`,
  respecting `isCodeChangeInProgress`)
- `getTaskNotificationCodesForHost` — the free task-code budget
- Lodgify `key_code`s — which codes are assigned/pinned (live, because bookings get extended)

```mermaid
stateDiagram-v2
    [*] --> Creating: room below target ∧ free task code ∧ no pending delete for the room
    Creating --> Provisioning: addSecondaryUser accepted
    Provisioning --> Standing: pendingInfo empty → read PIN → snapshot
    Provisioning --> StuckPending: pending > FB_PENDING_ALARM_HOURS (ops alert, human decides)
    Standing --> Assigned: issued at breach (fast path, from the snapshot)
    Assigned --> Standing: hold buffer passed ∧ effective uses < MAX_USES
    Assigned --> RotationEligible: hold buffer passed ∧ effective uses ≥ MAX_USES
    RotationEligible --> [*]: removeSecondaryUser returns (immediate) — task code returned, replenish
    RotationEligible --> DeleteError: API error → ops alert (auto-retry is a future enhancement)
```

**Identity.** Fallback users are named `locklink-ec-<roomSlug>-<epochSeconds>` with a
plus-addressed email on our domain. The prefix marks ownership (only prefix-matching users are
ours; everything else is foreign and untouchable); the room slug maps from config; the timestamp
provides uniqueness, the stable creation order the selection rule needs, and a creation record
Lynx itself doesn't keep. Retry safety needs no exact-name determinism: convergence counts a
room's users by prefix, so a create whose response was lost is simply found and counted on the
next pass — never duplicated.

**Create fields** (human-readable; wire mapping in
[lynx-api.md](./lynx-api.md#create-user--addsecondaryuser)): First/Last Name, Email Address,
Mobile Number (any numeric input accepted — we send `1`), Need Access Code (yes), Task
Notification Code (an id from the available pool), Role (an id from a static-but-queryable
list), Tags (unused), Permission Level (static constant), Group(s) (the room's group).

**Write discipline** — creates and deletes hit the unofficial Lynx API, so minimize them (the
reuse policy is the primary lever):

- **Read-before-write, always** — every pass re-observes the live user list before mutating;
  nothing is created or deleted on remembered state.
- **Hard ceilings** counted from the live user list: never more than the per-room target, never
  more than the global target of prefix-owned users.
- **Delete is one-shot.** `removeSecondaryUser` either returns (the user and its task code are
  gone from Lynx immediately — an immediately-consistent operation, so there is no "pending
  delete" and a replacement create may follow at once) or it returns an **API error** → **ops
  alert** (in MVP; a stateless bounded retry is a [future enhancement](./future-architecture.md)).
  What is **not** observable either way is whether lock hardware actually cleared the code —
  suspected to lag with no signal to verify. That residual-access window is accepted and
  mitigated by the reuse policy (fewer rotations); unlock-activity monitoring
  ([future](./future-architecture.md)) is the only real verification path.
- **Stuck-pending**: a create still pending past `FB_PENDING_ALARM_HOURS` alarms for operator
  remediation. Deliberately **not** auto-deleted-and-recreated — retry loops against a flaky
  unofficial API are how the whole budget burns overnight.

⚠️ **Probe-gated before implementation**: real provisioning timing (vs the documented 24 h).
The PIN-read question is resolved (`getSecondaryUserInformation`); delete behavior at the API
level is resolved by repeated observation (immediate), with hardware clearing accepted as
unverifiable.

## Notifications & escalation

Notifications split by **audience** — who has to act — which turns out to be outcomes vs.
causes:

- **Business** (property manager) — outcomes where a human can act. In MVP the business cases are
  exactly three: a booking that will reach an imminent arrival with **no code deliverable**
  (critical — see below), a room whose **standing fallback pool hits zero** (warning), and the
  **daily pre-close pool check** (warning — below). Business alerts fire **only when a business
  action is needed**; routine automated events (a normal send, a fallback issuance, a rotation)
  are metrics, not alerts.
- **Operational** (engineers/maintainers) — system _causes_ needing technical attention: a
  `confirmationCode` that doesn't parse, a booking with no Lynx reservation, a message send
  returning an error envelope, a sent message whose `message_status` lands on `Failed`,
  reconciler faults (pool below target, stuck provisioning, a delete API error), and the
  catch-all for whole-run failures. The business also hears automatically whenever a system
  cause produces the guest-impacting outcome above.

### The "no code deliverable" alert (the one booking-scoped escalation)

A booking gets a code by one of two paths — the **normal** code (sent as soon as it is ready,
within the send window) or the **fallback** code (issued at the fallback lead if the normal code
never arrived). An alert is warranted only when **neither will reach the guest**. That single
**critical** fires **once**, at the earliest moment delivery is known to have failed:

- **At the fallback breach** — `max(arrival − FALLBACK_LEAD, created + GRACE)` — if no code has
  been delivered (the fallback couldn't be issued or sent). This is the common trigger; the
  default lead leaves the manager a few hours to intervene manually.
- **Earlier, at the normal-code stage**, if delivery is already known **impossible** — the thread
  is `is_closed`, there is no `thread_uid`, or another hard sendability invariant is broken. Since
  the fallback would fail to send identically, there is no reason to make the manager wait for the
  fallback breach; fire the critical the moment the blocker is seen inside the send window. (A
  code that is merely _not ready yet_, with delivery otherwise healthy, is **not** a trigger — the
  fallback is expected to cover it, so it stays a metric.)

There is **no second alert at arrival** (a real blocker doesn't self-heal in the final hours — a
repeat carries no new information and can't be acted on differently) and **no early warning for a
plainly not-ready code** (noise, and not actionable — provisioning can't be expedited). The one
case an early heads-up _would_ help — a **lock fault** (offline / jammed) that also breaks the
fallback code — needs lock-health data we don't consume in MVP; it is the top item of the
[fault-aware early warning](./future-architecture.md) future feature.

### Daily pre-close pool check

Once a day, at `WORKDAY_POOL_CHECK_LOCAL` (property-local, a few hours before staffed hours end),
any room with **zero standing fallback codes** raises a business **warning**. The rationale is
staffing, not the pool state itself: a room at zero fallback codes is only a real risk if a late
booking lands and provisions slowly, and that risk peaks after staff have gone home — so
surfacing it before close lets the manager pre-stage a code or stand by. It is a distinct,
scheduled trigger (not a re-alert of the event-based zero-standing warning), so it survives the
one-shot rule.

**Severity**: the booking-scoped "no code deliverable" alert is always **critical** (an imminent
guest with no way in). Pool alerts are **warning**. Operational cause-scoped alerts carry a fixed
severity (warning for data anomalies, critical for a whole-run failure). There is no
warning→critical time ramp, so no `CRITICAL_HOURS` threshold.

**Alerts fire once (MVP).** Each condition notifies **once per booking** (or, for the pool check,
once per daily run) and doesn't repeat — lock-link has no acknowledge/pause/clear mechanism, so
re-firing would be unmanageable noise. The underlying _action_ still retries every tick (the
schedule is the retry); only the _alert_ is one-shot. Configurable re-alerting is a
[future enhancement](./future-architecture.md). CloudWatch alarms are separate (their state
transitions de-duplicate natively).

**Plumbing**: one `Notifier` interface (`createSnsNotifier` publishes with severity as the
subject prefix and audience + severity as message attributes), backed by **two SNS topics**
consumed by ARN — either can later become a shared cross-workload channel with no code change.
CloudWatch alarms (sync health + messaging alarms) target the operational topic; business
notifications are runtime-emitted with the booking/guest context the manager needs to act.

---

## Scope & config

- **Properties are enumerated dynamically** from Lynx's active set, then polled per
  `propertyId`. **No static property list and no `property_id` map.** New properties (rare,
  gated by physical construction) sync zero-touch; the Lodgify `property_id` is never needed —
  the write resolves a booking from `confirmationCode` and reads `room_type_id` from the Lodgify
  booking. The loop enumerates fresh each run.
- **No reservation-level filtering** (e.g. on `rentalMarketPlace`). Everything in Lynx is
  Lodgify-linked, so every reservation is expected to resolve to a Lodgify booking — filtering
  would risk silently dropping legitimate bookings. A reservation that **doesn't resolve to an
  existing Lodgify booking is an error → escalate**, never a silent skip.
- Volume: ~28 records/week, up to ~6 months ahead → a few hundred records max. Modest request
  rates + jitter, back off on errors.

### Configuration

Timing knobs are tabled in the Timing section. The rest (all required, validated at cold start):

| Env var                       | Purpose                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `LL_ACCOUNT_ID`               | Lynx umbrella account id (drives the join suffix)                      |
| `LL_USER_ID`                  | Lynx per-user id sent as `hostId`/`loggedInUserId`                     |
| `LL_BUSINESS_ALERT_TOPIC_ARN` | SNS topic for business alerts (property manager)                       |
| `LL_OPS_ALERT_TOPIC_ARN`      | SNS topic for operational alerts (engineers)                           |
| `LL_LYNX_USERNAME_PARAM`      | SSM SecureString name — Lynx username                                  |
| `LL_LYNX_PASSWORD_PARAM`      | SSM SecureString name — Lynx password                                  |
| `LL_LODGIFY_API_KEY_PARAM`    | SSM SecureString name — Lodgify API key                                |
| `LL_FB_CODES_PARAM`           | SSM SecureString name — the fallback pool snapshot                     |
| `LL_TIMEZONE`                 | Property timezone for local-time computations (e.g. `America/Chicago`) |
| `LL_FB_TARGET_PER_ROOM`       | Standing fallback codes per room (2)                                   |
| `LL_FB_MAX_USES`              | Guests per code before rotation (`number \| 'unlimited'`, 1)           |
| `LL_FB_GROUP_MAP`             | JSON map, Lodgify `property_id` → Lynx group id + room slug            |
| `LL_FB_ROLE_ID`               | Lynx role id for fallback users                                        |
| `LL_FB_EMAIL`                 | Base email for plus-addressed fallback users                           |
| `LL_LYNX_TOKEN_PARAM`         | SSM SecureString name — durable Lynx JWT cache                         |

- **SSM SecureString values are populated out-of-band** on initial setup (CFN never sees secret
  material); the stack grants the Lambda `ssm:GetParameter` on the named parameters plus
  `kms:Decrypt` scoped by `kms:ViaService = ssm.<region>.amazonaws.com`. Credentials are read at
  runtime via Powertools with a ~2 h cache; the fallback-code store is read with a cache-bypass
  at issuance time.
- **Lynx JWT cache** (`LL_LYNX_TOKEN_PARAM`, read+write at runtime): the Lambda persists
  the minted JWT (valid ~95 days) so cold starts don't repeatedly call `login`; a 401 forces a
  re-mint and write-back. Zero setup — the first-ever run mints normally and creates the
  parameter.

---

## Deployment architecture

- **AWS CDK** app (TypeScript), **not** Serverless Framework. Deployed to the **saas-apps**
  account (`444705667097`; test account `saas-apps-test` `425946675033`), **us-east-1** (the
  bootstrapped region — keep the deploy region aligned with bootstrap).
- **Scheduled Lambda**: `NodejsFunction` (Node 24, esbuild-bundled) on a minute-aligned
  EventBridge cron rule at `TICK_MINUTES` (see Timing). Bundling uses `--conditions=source` so
  workspace deps bundle from source.
- **Package layout — `infra/` + `src/` split** (single package): `infra/` holds the CDK app +
  stack and may depend on `src/`; `src/` holds runtime/handler code. **eslint bans importing
  `aws-cdk-lib`/`constructs` or `infra/` from `src/`** (one-directional boundary) — generated by
  the repo-kit `cdk` feature into `eslint.config.d/`.
- **Observability**: `@twin-digital/observability-lib`
  (`withObservability(handler, { serviceName })`; logger/metrics injected on the handler
  `context`).
- **CI/CD**: GitHub Actions. Deploys are tool-typed turbo tasks — CDK apps run `deploy:cdk`; the
  `cdk` job assumes `GitHubActionsCdkDeployRole` (saas-apps) via OIDC. CDK bootstrap + the OIDC
  role live in the `twin-digital/aws` Terraform repo. Deploys are **continuous on merge to
  main** — see twin-digital/opus#189 for the future release-gating item.

## Module layout

- `lynx/` — client (`login` + `TokenCache` seam, `listProperties`, `listReservations`,
  `listSmartLocks`), zod schemas, and `createSsmTokenCache` (durable JWT cache backed by SSM
  SecureString).
- `lodgify/` — client (`listBookings`, `getBooking`, `putKeyCodes`, `getThread`,
  `addBookingMessage`), zod schemas, the vendored OpenAPI + `pull-spec` refresh tool.
  `addBookingMessage` parses the response body for the success/error envelope.
- `sync/` — `resolveBookingId(confirmationCode)`, `checkReadiness`, key-code encode/decode, the
  fallback-code fallback (store read + deterministic pool selection), message composition + the
  deterministic `message_id` derivation, `runSync` (capture + message phases), and
  `createSnsNotifier`.
- `config.ts` — env-sourced, zod-validated `LockLinkConfig`; `secrets.ts` — Powertools SSM
  SecureString reads.
- `functions/sync.ts` — the Lambda handler: `loadConfig` → build notifier → `loadSecrets` →
  build clients → `runSync`, wrapped in try/notify/rethrow so a whole-run failure reaches the
  escalation sink.

## Glossary

- **Gap** — a Booked, in-horizon Lodgify booking whose `key_code` is empty: codes not yet
  captured.
- **Horizon** — how far ahead the loop looks at all; bookings arriving beyond it are ignored
  until they drift in.
- **Capture** — resolving a gap's per-lock codes from Lynx and writing them (encoded) to
  `key_code`. Requires readiness.
- **Readiness** — every lock in the room's lock set has this reservation's code with
  `syncToLockStatus: "success"`; codes may differ per lock.
- **Send window** — the span before arrival in which messaging is allowed; opens at
  `NORMAL_LEAD_HOURS`, never closes until checkout.
- **Fallback lead** — the deadline: if the normal code isn't delivered by `FALLBACK_LEAD_HOURS` before arrival, the fallback code is issued; failing that
  triggers escalation and the fallback.
- **Grace** — suppression of escalation while a booking is too new for Lynx to have plausibly
  provisioned it; a tighter value applies past check-in.
- **Breach (T0)** — the derived instant a booking becomes overdue:
  `max(arrival − FALLBACK_LEAD, created + GRACE)`, or `checkIn + postCheckInGrace` past check-in.
- **Severity** — urgency tier (`info`/`warning`/`critical`) on a notification; for
  booking-scoped alerts, recomputed each tick from time-to-arrival. Distinct from **audience**.
- **Audience** — who acts on a notification: **business** (property manager; guest-impacting
  outcomes → manual processes) or **operational** (engineers; system causes).
- **Fallback code** — a standing code in a room's locks (the door code of a synthetic Lynx
  fallback user), issued at breach as a capture fallback; rotated by the pool reconciler after
  the stay.
- **Fallback user** — a synthetic Lynx user (no human attached) whose user-specific door code
  is a standing fallback code; named `locklink-ec-<roomSlug>-<epochSeconds>`.
- **Task code** — a required attribute of any Lynx user with a door code, serving Lynx workflows
  unrelated to us (never guest-facing, never a door code). The scarce creation input: consumed
  by creating a user, returned by deleting one. Enumerated live, never assumed.
- **Standing code** — a fully provisioned fallback code waiting in a room's warm pool.
- **Pinned** — an issued fallback code that cannot be rotated because its booking's stay
  (+ hold buffer) isn't over, derived live from Lodgify.
- **Tick** — one scheduled run; all time logic keys off its _scheduled_ fire time.
- **Interval gate** — the stateless pattern `epoch(scheduledTime) % INTERVAL < TICK`: acts on
  the first tick of each interval (Lynx slow tier, fallback-pool reconciler cadence).
- **Read-before-send** — the sent-check: our deterministic `message_id` present in the booking's
  thread ⇔ already messaged.

## Appendix: failure-mode catalog

**Retry philosophy: the schedule is the retry.** Nothing loops in-run (single exception: one JWT
re-mint on a Lynx 401); every per-booking failure leaves state untouched so the next tick
re-attempts. EventBridge's async redelivery (up to 2 retries on function error) is harmless by
the same idempotency.

**Alarm latency**: the `Notifier` is the fast path — a whole-run failure SNS-publishes before
rethrowing, reaching the operator in seconds. CloudWatch alarms are the backstop for when even
that fails: `FunctionErrors` (1 h period, threshold ≥ 1) typically transitions within minutes of
the errored invocation and the failure re-breaches every tick; `InvocationsBelowMinimum` catches
a stopped schedule within ~24 h. ⚠️ Its threshold assumes the tick rate — retune it whenever
`TICK_MINUTES` changes (at 10-minute ticks, ~132 of 144 expected/day).

| #   | Failure                                                   | System response                                                                                                                                                                                                 | Audience / severity                                                                | Retry                       | Metric / alarm                            |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| 1   | Bad/missing env config at cold start                      | Throws before the notifier exists — Lambda invocation error                                                                                                                                                     | — (alarm only)                                                                     | Next tick                   | Lambda `FunctionErrors` alarm (ops topic) |
| 2   | Secrets unreadable (SSM/KMS)                              | Whole-run failure: catch-all notify + rethrow                                                                                                                                                                   | Ops / critical                                                                     | Next tick                   | run-failure notify + Lambda errors alarm  |
| 3   | SNS publish itself fails                                  | Error propagates → Lambda error; the alarm layer backstops the notifier                                                                                                                                         | — (alarm only)                                                                     | Next tick                   | Lambda errors alarm                       |
| 4   | Lodgify list/read down, 401, 5xx, schema drift            | Whole-run failure (can't enumerate)                                                                                                                                                                             | Ops / critical                                                                     | Next tick                   | as #2                                     |
| 5   | Lynx login fails (bad creds)                              | Whole-run failure                                                                                                                                                                                               | Ops / critical                                                                     | Next tick                   | as #2 + `LynxLogins` churn alarms         |
| 6   | Lynx 401 mid-run                                          | Re-mint once, retry the call; a second failure → whole-run                                                                                                                                                      | Ops / critical (2nd only)                                                          | In-run once, then next tick | as #2 + `LynxLogins`                      |
| 7   | Lynx down / 5xx / drift on one property                   | Property-scoped failure: skip the property, continue the others _(depends on opus#201; today a property failure aborts the run)_                                                                                | Ops / warning                                                                      | Next tick                   | property-failure metric                   |
| 8   | `confirmationCode` unparseable                            | Skip the reservation, continue                                                                                                                                                                                  | Ops / warning (once)                                                               | Next tick                   | outcome metric                            |
| 9   | Same booking id resolved from two properties              | Keep the first entry, alert                                                                                                                                                                                     | Ops / warning                                                                      | Next tick                   | outcome metric                            |
| 10  | Lodgify booking with no Lynx reservation                  | Skip until overdue; at T0 the fallback applies (Lynx-independent). Code delivered → no alert; not deliverable → the no-code-deliverable critical                                                                | Business / critical (once, only if undeliverable)                                  | Every tick                  | outcome metric + unmessaged-overdue       |
| 11  | Locks not ready (the normal case)                         | Skip; calibration transitions recorded                                                                                                                                                                          | none until T0                                                                      | Fast/slow tier per window   | calibration metrics                       |
| 12  | Still not ready at T0                                     | **Fallback issuance**: ordinary `key_code` write from the room's pool + normal message step; fires even when the Lynx check failed this tick                                                                    | — (metric only; the message itself is the record)                                  | —                           | fallback-issued metric                    |
| 13  | Breach with no standing code / snapshot unreadable        | No issuance; the ordinary overdue escalation continues                                                                                                                                                          | Business / critical (code needed, none exists) + Ops / warning                     | Every tick (alert once)     | fallback-issuance-failed metric           |
| 14  | `putKeyCodes` 404/400, or read-back mismatch              | Skip the booking; it remains a gap                                                                                                                                                                              | Ops / warning                                                                      | Next tick                   | keycode-write-failed metric               |
| 15  | Booking missing `thread_uid`, or thread read fails        | **No blind send** — skip messaging this tick                                                                                                                                                                    | Ops / warning (once)                                                               | Next tick                   | thread-read-failed metric                 |
| 16  | Thread `is_closed`                                        | Cannot message; guest unreachable through Lodgify — a hard sendability blocker, so the no-code-deliverable critical fires **early** (at the normal-code stage), the fallback being equally unsendable           | Business / critical (once) + Ops / warning                                         | Every tick until it reopens | thread-closed metric                      |
| 17  | Send returns an error envelope (HTTP 200 lies)            | **Re-read the thread** — never classify by error text. Our `message_id` present → the message exists (benign duplicate/race) → treat as sent, log only. Absent → real failure → alert; booking stays unmessaged | none, or Ops / warning; the business no-code-deliverable alert fires independently | Next tick                   | message-send-failed metric (alarmed)      |
| 18  | Send network failure / 5xx                                | Not sent; booking still unmessaged                                                                                                                                                                              | Ops / warning                                                                      | Next tick                   | message-send-failed metric (alarmed)      |
| 19  | Sent, but `message_status` → `Failed` later               | ⚠️ **Manual remediation by design**: the message exists in the thread, so read-before-send won't resend, and the same `message_id` can't be re-POSTed. Alert for a manual resend via the Lodgify inbox          | Ops / warning + Business / ramps                                                   | Manual                      | message-delivery-failed metric (alarmed)  |
| 20  | Still unmessaged approaching arrival                      | The single "no code deliverable" business-critical (at the fallback breach, or earlier on a known sendability blocker)                                                                                          | Business / critical (once)                                                         | Send retried every tick     | guest-arrival-without-message (alarmed)   |
| 21  | Code rotated in Lynx after capture                        | Not detected (static-codes assumption); the captured code is messaged                                                                                                                                           | —                                                                                  | —                           | open question / stretch re-verify         |
| 22  | Room's standing pool below target                         | Reconciler replenishes (create); if the budget is exhausted, stays degraded                                                                                                                                     | Ops / warning + Business / warning at zero standing (standby)                      | Reconciler gate             | pool-standing metric (alarmed)            |
| 22b | Daily pre-close check finds a room at zero standing codes | Business warning: a late check-in would have no fallback after staffed hours — pre-stage a code or stand by                                                                                                     | Business / warning (once/day)                                                      | Daily                       | pool-standing metric                      |
| 23  | Fallback create still pending past the alarm window       | Operator remediation; deliberately no auto delete-recreate                                                                                                                                                      | Ops / warning                                                                      | Manual                      | fb-pending-age metric (alarmed)           |
| 24  | Fallback-delete API error (removeSecondaryUser fails)     | Delete is immediately consistent in Lynx's DB (no "unconverged" state); an API error raises an ops alert (MVP: no auto-retry). Hardware clearing is unverifiable — accepted, mitigated by the reuse policy      | Ops / warning                                                                      | Manual                      | fb-delete-error metric (alarmed)          |
| 25  | Foreign task-code consumption squeezes the budget         | Target becomes unreachable; surfaced by the below-target alarm                                                                                                                                                  | Ops / warning                                                                      | —                           | pool-standing metric                      |

Row 19 is the one deliberate gap: delivery-failure recovery stays manual unless the
`message_id` scheme grows an attempt counter — not worth the complexity until a `Failed` is ever
observed in practice.

## Open questions / follow-ups

- **Verify OTA channel push on the first real OTA-sourced send** (documented behavior of
  `send_notification`, not yet observed live; watch the message's `route`).

Deferred features and enhancements — configurable re-alerting, best-effort code freshness,
unlock-activity monitoring, Lodgify webhooks, fallback-delete auto-retry, per-property Lynx
error isolation, and deploy-maturity items — are collected in
[future-architecture.md](./future-architecture.md).
