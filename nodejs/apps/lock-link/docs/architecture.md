# lock-link — architecture & design

`@twin-digital/lock-link` delivers smart-lock access codes from **Lynx** (smart-lock /
property-management system, internally "Cat") to guests booked through **Lodgify**
(short-term-rental PMS / channel manager, internally "Hotel"). It replaces a manual workflow:
a property manager reads each reservation's door codes off the Lynx dashboard and pastes them
into the matching Lodgify booking for Lodgify's scheduled messages to deliver.

lock-link owns delivery end-to-end: it **captures** per-lock codes into the Lodgify booking's
`key_code` field, then **messages** the guest through Lodgify's messaging API (landing in the
unified inbox) once codes are provisioned and arrival is near. Sending our own message is what
makes two things possible that Lodgify's "X days before arrival" templates cannot do: carry a
different code per lock, and hold delivery until provisioning has actually succeeded (a template
fires on schedule even when the code isn't ready — worst on last-minute bookings, where "1 day
before" means "immediately").

The scheduled Lambda runs the full read → resolve → validate → capture → message → escalate
loop described below. The integration contracts are all proven against live data.

---

## Data flow

**Lodgify-driven, gap-fill, two phases.** Drive from the _official_ Lodgify API and touch the
unofficial Lynx API only for actual gaps — so Lynx usage scales with new near-term bookings (not
calendar size) and quiesces to **zero** once everything in-horizon already has its codes.

```
            scheduled Lambda (lock-link, cron)
  1. Lodgify: list Upcoming + Current bookings within a horizon
     (e.g. next 1-2 weeks), status Booked
  2. capture — bookings with NO key_code  ──►  the "gap set":
       Lynx: pull the properties' reservations, index by confirmationCode,
       resolve each gap's per-lock codes + provisioning readiness
       ready (all locks success) → Lodgify: PUT keyCodes (encoded, see below)
  3. message — bookings WITH key_code, inside the send window:
       Lodgify: read the booking's message thread; our deterministic
       message_id absent → POST Owner message carrying the codes
       (parsed back out of key_code), send_notification = true
  4. not ready / not sent + near arrival → notify (escalate)
```

**Capture and message are deliberately decoupled — but pipelined within a tick.** Capture
usually runs days-to-weeks before the send window opens, and once it lands the codes live in
Lodgify's own booking record — so at send time the only dependency is Lodgify. A Lynx outage can
delay capture (retried on the schedule, with lots of slack) but can never block a send. The
`key_code` field doubles as the local store: no separate database, visible to the host in the
Lodgify UI, and any legacy Lodgify template that references the key-code variable still renders
something correct. Within a single run, each booking flows through capture → message in one
pass: a booking that becomes ready inside the send window is messaged in the same invocation,
never parked for the next tick. This matters most for same-day bookings, where every tick of
delay is guest-facing.

**Cadence & Lynx tiering.** The rule fires every **15 minutes** (minute-aligned cron), but Lynx
re-checks are tiered so Lynx pressure still scales with urgency, not with the faster clock:

- Gaps **inside the send window** (`hoursToArrival <= SEND_HOURS`, including past-check-in
  bookings) → Lynx re-checked **every tick**. These are the bookings where readiness latency is
  guest-facing.
- Gaps **outside the send window** → Lynx re-checked only on the first tick of each slow
  interval: `epoch(scheduledTime) % LYNX_SLOW_INTERVAL < TICK_RATE`. Stateless — the schedule is
  the state, no check timestamps stored anywhere — and the interval is an arbitrary tunable
  (need not align to hours). A booking arriving next week loses nothing by being re-checked
  every hour or two.

Tiering decisions key off the **scheduled** tick time, not the wall clock: the EventBridge event
carries the nominal fire time (`event.time` on classic rules; `<aws.scheduler.scheduled-time>`
with EventBridge Scheduler), so delivery jitter, cold starts, and async-retry redelivery all
resolve to the same logical tick. Snap the received time to the tick grid for sub-minute wobble.
The guarantee is "at most one slow-tier check per interval" — if that one tick errors out, the
interval's check is skipped until the next window, a bounded staleness that never affects
in-window gaps (checked every tick regardless).

At steady state (no gaps at all) even the slow-tier tick makes no Lynx calls; the faster cadence
costs only a Lodgify list read per tick. Worst-case detection latency for a same-day booking is
one tick (~15 min) plus Lynx's own provisioning time.

**Latency calibration.** Lynx keeps no event history (no timestamps on reservations or access
codes, and `past` reservations return `accessCodes: []`), so provisioning latency can only be
measured by observing it live. The loop therefore emits calibration metrics as it works: per gap
booking, the observed transitions (first seen as gap, first seen ready, captured, messaged) with
the Lodgify `created_at` as the clock-start. These distributions — especially the same-day
segment — are what tune `SEND_HOURS`, the post-check-in grace, and the tick rate over time.

At steady state (no in-horizon gaps) the Lynx half of step 2 is skipped entirely — no Lynx calls.
The Lodgify→Lynx join uses `confirmationCode` (it embeds the Lodgify booking id); the
Lodgify→Lynx `property_id` map is only an optimization (query one Lynx property instead of all
four when filling a gap).

> [!IMPORTANT]
> **We assume door codes are static once set.** A Lodgify booking that already has a `key_code` is
> treated as captured and never re-checked against Lynx, so a _rotation_ of the code in Lynx after
> capture would not propagate — the guest would be messaged the captured codes. The data suggests
> codes are assigned once and stable. If that proves untrue, add a best-effort re-check against
> Lynx at send time (see open questions) or a scheduled reconciliation for the in-horizon set.

---

## Lynx (source) — reverse-engineered API

Lynx has no public API/webhooks, but its dashboard frontend calls a private JSON endpoint we can
call directly. **The UI renders codes with a glyph font (display-layer obfuscation); the JSON
returns them as plaintext** — so no scraping or OCR is needed.

### Auth

- `POST https://api.getlynx.co/ProdV1.1/api/v1/auth/login`
- Body: plaintext JSON `{ "email": "...", "password": "..." }` (the Lynx account
  identifier is an email address — the `LOCK_LINK_LYNX_USERNAME_PARAM` env var
  historically names it `username`, but the wire field is `email`).
- Response: a **JWT in the `x-auth-token` response header** (not the body). `exp ≈ 95 days`.
- Use as `Authorization: Bearer <token>` on subsequent calls.
- **Cache the token** (it lasts ~3 months); **re-mint on `401`**. Logging in rarely is also the
  lowest-profile behavior. HTTPS only; creds/token never logged.

### Read reservations

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getReservationsByProperty` — POST with the query params in the JSON body (not the URL); a read modeled as a POST query.
- Body: `{ "hostId": "<per-user id>", "loggedInUserId": "<per-user id>", "propertyId": <int>, "type": "current", "page": "1", "perPage": 5 }`
- Paginated — see `paginationInfo` (`total`, `totalPages`, `page`, `perPage`). Bump `perPage` or
  loop pages.
- `type` ∈ `upcoming` | `current` | `past`. **Poll `upcoming` (primary — get codes in before
  arrival) and `current` (catches same-day / in-house).** **`past` returns `accessCodes: []`** (codes
  are cleared after checkout) — skip it, and don't let empty-on-past trip escalation.
- Access code: `data.reservations[].accessCodes[].code` (plaintext, e.g. `"9234"`; usually the
  same across a reservation's locks, but legitimately differs per lock — capture each entry).
  Each entry also carries `syncToLockStatus` (the readiness
  signal) and `syncToCloudStatus`. Lynx additionally emits `isCodeSet` / `isHubCommunicated`
  int-booleans; not modeled in the schema — see the smart-lock note below.

### Lock set & health — `getSmartLocksByPropertyWithStatus`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getSmartLocksByPropertyWithStatus`
- Body: `{ hostId, loggedInUserId, propertyId, page, perPage, isHubAndLockStatusRequired: true, provisioningInfo: true, skipDeviceStatusApiCall: false }`
- Returns `data.smartLocksInfo[]` — **the property's full lock set** (`paginationInfo.total` = lock
  count; property `72230` has **3**: Dalton Door, 4th Street Lofts, Front Door). Each entry has
  a `lockName` (the join key against a reservation's per-lock access-code entry) plus health
  metadata: `provisionStatus`, `connectivityStatus`, `batteryLevel`, `isJammed`,
  `provisioningInfo`, `syncToLockStatus`, `lockModelUniqueName`.
- The sync consumes only `lockName`. Health-metadata wire types have drifted repeatedly
  (`isJammed` swung boolean → int → other; `batteryLevel` swung number → string) and
  strict schemas for fields we don't read block the sync on validation errors that don't
  affect behavior. `smartLockSchema` therefore models only `lockName`; the rest is
  stripped on parse (zod's default `.strip()`) and immune to further wire drift. Add
  fields back — typed against observed wire data at the time — when a consumer lands.
- This gives the **denominator** for "all locks ready" (how many locks a reservation must cover).
- A lock's `erCode` here is its **base/default** code, **not** the per-reservation guest code (which
  lives in the reservation's `accessCodes[].code`).

### Property list — `getPropertiesWithDeviceFiltersNew`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getPropertiesWithDeviceFiltersNew`
- Body: `{ hostId, loggedInUserId, searchKey: "", sortBy: { by: "name", order: "asc" }, page, perPage, filters: {} }`
- Returns `data.properties[]` — `uniquePropertyId` (the `propertyId`), `name`, address, `timeZone`,
  `propertyStatus`. **Enumerate the active set** (`propertyStatus == "ACTIVE"`) → the list of
  `propertyId`s to poll. (Account `222262` currently: 72229 Markham, 72230 Dalton, 72231 Lakeshore,
  72232 Rex.) This is the dynamic enumeration source — no static list.

### Reservation shape (the fields we use)

| Field                                   | Example            | Use                                                                 |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `confirmationCode`                      | `20559349VK222262` | **join key** → Lodgify booking id (see below)                       |
| `accessCodes[].code`                    | `9234`             | the door code(s) to capture — one entry per lock                    |
| `accessCodes[].lockName`                | `Front Door`       | per-lock label (encoding + guest message when codes differ)         |
| `bookingId`                             | `10490339`         | Lynx-internal id (NOT Lodgify's)                                    |
| `guestFirstName/LastName`, `guestEmail` | `Heather Cobb`     | sanity-match against Lodgify                                        |
| `checkInTimestamp`/`checkOutTimestamp`  | `2026-06-15/16`    | sanity-match                                                        |
| `rentalMarketPlace`                     | `LODGIFY`          | constant (the PMS), not a key                                       |
| `bookingSource`                         | `12`               | int channel code (Expedia here); useful to spot non-Expedia records |

### Readiness & escalation (the "invariant" is a steady state, not always-true)

Lock provisioning is **eventually consistent** (Lynx scheduling, lock memory limits, hub comms,
transient errors), so a reservation legitimately spends part of its life only partly provisioned.
"All locks set to one code" is therefore a **readiness signal, not an always-true invariant.**

- **Ready** = the reservation's `accessCodes` cover **every** lock in the property's lock set (count
  from `getSmartLocksByPropertyWithStatus`), each with **`syncToLockStatus: "success"`**. Codes are
  **usually uniform across a reservation's locks but legitimately differ** (observed live
  2026-07-07: front door `2968`, back door `3350` on one booking) — capture every lock's code, don't
  require them to match. ⚠️ A lock's `code` is assigned up front, **even while the lock is still
  `"scheduled"`** (assigned but not yet pushed to the hardware) — so code presence is **not** a
  readiness signal; **`syncToLockStatus: "success"` is.** Only when all locks are `success` do we
  capture to Lodgify — **never capture a partial/unsynced code set** (a code that opens some doors
  is worse than none). Seen states so far: `scheduled` (pending), `success` (live).
- **Not ready is normal**, not an error — skip and re-check next run. The schedule is the retry and
  the stateless diff converges.
- **Escalate only when the booking is overdue and still unmessaged** — whether it is stuck at
  capture (locks not ready) or at send (thread closed, sends failing). Computed statelessly from
  `checkInTimestamp` (+ the booking `createdAt` for a grace window): escalate if
  `hoursToArrival <= SLA` (target: guest has their codes **≥24h before arrival**) **and**
  `bookingAge >= GRACE` (so brand-new / same-day bookings aren't flagged the instant they appear;
  after the grace, a still-unmessaged imminent booking _is_ urgent). Severity ramps with proximity
  (info > 24h, warn inside the window, critical < a few hours / past arrival — a guest arriving
  without their codes is the worst outcome the system can produce). **Once `now >= checkIn` the
  grace tightens** (≈10 min instead of 30) and severity is critical immediately after it — the
  guest may be at the door, and the operator needs the earliest possible chance to intervene
  manually. Both grace values are tunables to revisit once the calibration metrics show Lynx's
  real provisioning-latency distribution. Enrich the message with lock health (offline / jammed /
  low battery vs just slow).

---

## The join rule (Lynx → Lodgify booking)

Lodgify's write endpoint needs Lodgify's **numeric booking number**, which Lynx never returns
directly. But it's embedded in `confirmationCode`:

```
confirmationCode = <lodgifyBookingId> + "VK" + <accountId>
20559349VK222262 = 20559349        +  VK  +  222262
```

- **Rule:** strip the trailing `VK<accountId>`; the leading numeric run is the Lodgify booking id.
- The `VK<accountId>` suffix is a **constant per Lynx account** (NOT channel-specific) — confirmed
  across Expedia, direct-Lodgify, and Booking.com reservations. So **every** `confirmationCode`
  must end with `VK<accountId>`; one that doesn't → escalate (free integrity check).
- Derive the suffix from the configured `accountId`, don't hardcode the literal `VK222262`
  (it's account-scoped).

### ID model (subtle — mirror the site)

- **`222262` = the umbrella Account ID** (shown in the Lynx UI header). It doubles as the primary
  user's id and is the value baked into every `confirmationCode` suffix.
- **Per-user ids are distinct** (e.g. `232753` for the dedicated automation user). These are what
  go in the API request body as `hostId` / `loggedInUserId`.
- Decision: **mirror what the dashboard does** — account id for suffix parsing, per-user id in
  request bodies. Don't try to rationalize why they're sometimes interchangeable.

---

## Lodgify (destination) — public API (v2, plus v1 for messaging)

- Auth: **`X-ApiKey: <key>`** header (Lodgify dashboard → Settings → Public API). Not a bearer
  token. The same key works for both API versions.

### Capture the door codes — keyCodes write + encoding

- `PUT https://api.lodgify.com/v2/reservations/bookings/{id}/keyCodes`
- `{id}` = the numeric booking number from the join rule (int32).
- Body: `{ "rooms": [ { "room_type_id": <int>, "key_code": "<encoded codes>" } ] }`
- **`key_code` is a free-form string and lock-link owns it** (single-host deployment, nothing else
  writes the field). Encoding convention:
  - all locks share one code → the bare code, e.g. `9234`
  - codes differ per lock → a labeled list, e.g. `Front Door: 2968 · Back Door: 3350`, locks
    ordered alphabetically by `lockName` so the encoding is deterministic
  - The labeled form is deliberately human-readable: the host sees the field in the Lodgify UI,
    and a legacy Lodgify message template that interpolates the key-code variable still renders
    something a guest can use. Round-trip fidelity (length, `·`, spaces) proven live 2026-07-07.
- Returns **200** with a rooms-only echo (`BookingKeyCodeDto = { rooms: [{ room_type_id,
key_code }] }`, per the vendored OpenAPI) — **not** a full booking → read back
  `rooms[].key_code` to confirm the write (no separate GET needed).
- Errors → notify sink: **404** booking/room not found (stale parsed id / room_type_id); **400**
  typed `code` (`ValidationError`/`ArgumentError`/…) + `message` + `correlation_id`; **401** bad key.
- One `key_code` per reservation maps cleanly to a single-room booking. (Lynx's locks are physical
  hardware; Lodgify only cares about the booking's room(s).)

### Message the guest — v1 messaging + v2 thread read

The guest-facing message is sent through Lodgify's messaging API so it lands in the **unified
inbox** thread for the booking (one conversation view for the host), and — for notified messages —
is delivered onward to the guest.

**Send** — `POST https://api.lodgify.com/v1/reservation/booking/{id}/messages`

- Body: an **array** of `{ subject, message, type, send_notification, message_id }`.
- `type: "Owner"` = host→guest. Always use `Owner`: ⚠️ `type: "Comment"` posts return success but
  the message is silently dropped (never appears in the thread — proven live).
- `send_notification: true` is the delivery switch — without it the message only sits in the
  thread (no email; proven live). With it, Lodgify emails the guest; per the API docs, bookings
  from an external channel have the message pushed through that channel instead.
- `message_id` is an idempotency key we control: a **UUIDv5 of `<bookingId>:access-codes`**
  (fixed namespace constant in code). Deterministic, so every run computes the same id for the
  same booking without any local state.
- ⚠️ **The HTTP status lies.** A successful send returns `200` with a literal `null` body. A
  failed send — including a duplicate `message_id` — **also returns HTTP 200**, with an error
  envelope in the body: `{ success: false, type: "domain_exception", statusCode: "400", ... }`.
  The client must parse the body; a duplicate-id rejection means "already sent" (benign — the
  read-before-send check normally prevents ever hitting it), any other envelope is a real
  failure → escalate.

**Read back** — `GET /v2/reservations/bookings/{id}` carries `thread_uid`;
`GET /v2/messaging/{thread_uid}` returns the thread (an array of thread objects) with every
message's `message_id`, `type`, `message_status`, and `route`.

- **Sent-check**: our message exists ⇔ a thread message carries our deterministic `message_id`.
  Exact-match, stateless, no local ledger. This check gates every send (read-before-send); the
  server-side duplicate rejection is only the backstop for the crash-between-send-and-read race.
- **Delivery signal**: `message_status` ∈ Submitted/Sent/Delivered/Failed — a notified message
  should reach `Delivered` (observed within seconds for email); `Failed` → escalate.
  Non-notified messages sit at `Unknown`; only notified ones are expected to progress.
- **Thread health**: `is_closed: true` (+ `error_title`/`error_message`) means the thread can no
  longer receive messages — that guest is unreachable through Lodgify → escalate immediately.
- `route` on messages was `null` for email-delivered messages on a Manual booking; the enum
  (`Email`/`Airbnb`/`BookingCom`/`Vrbo`/`Sms`) suggests OTA bookings populate it. **Channel push
  for OTA bookings is documented but not yet verified live** — verify on the first real OTA send.

### Send window

A booking is messaged when **all** of these hold; the schedule is the retry (see Cadence & Lynx
tiering in the data-flow section):

1. **Codes captured** — `key_code` is set (which already implies readiness held at capture time).
2. **Inside the window** — `hoursToArrival <= SEND_HOURS`. Codes are live on the locks the moment
   Lynx reports `success`, so messaging weeks ahead is a small security/confusion cost with no
   benefit; the window bounds it. Late bookings need no special case: a booking made 2 hours
   before arrival is born inside the window and is messaged on the first run after capture.
3. **Not already sent** — the read-before-send thread check above.

There is **no cutoff at arrival** — attempts continue until checkout (a guest mid-stay without
their codes still needs them; late beats never). Missing the SLA is the _escalation's_ trigger,
never a reason to stop sending.

### Message content

Fixed template (single-host deployment — no per-host customization): greeting with the guest's
name, property name, arrival date, and the codes — one line when uniform, a labeled list per lock
when they differ. Plain text; the thread stores what we send verbatim and email delivery preserves
it.

### List bookings (the poll driver) — `GET /v2/reservations/bookings`

- `GET https://api.lodgify.com/v2/reservations/bookings` (`X-ApiKey`). Query: `stayFilter=Upcoming`
  (or `ArrivalDate`/`DepartureDate` + `stayFilterDate` for a horizon window), `page`/`size`,
  `includeCount`, `updatedSince` (incremental).
- Returns `BookingSetDto { count, items: BookingDto[] }`. Each booking carries `id`, `property_id`,
  `arrival`/`departure`, `status` (Booked/Tentative/Declined), `is_deleted`, `source`, and
  **`rooms[].room_type_id` + `rooms[].key_code`** — so the list alone yields both the **gap signal**
  (empty `key_code`) and the `room_type_id` needed to write. The gap set = `status == Booked`, within
  horizon, `key_code` empty.

### Read a booking (resolve / diff)

- `GET https://api.lodgify.com/v2/reservations/bookings/{id}` returns `id`, `guest{name,email}`,
  `arrival`/`departure`, `property_id`, `rooms[{ room_type_id, key_code }]`, `source`,
  `source_text` (the real OTA reference, e.g. Expedia `2462813314`).
- **Stateless diff:** the booking JSON already contains the current `rooms[].key_code`. Compare it
  to the encoded string we would write and **PUT only when they differ** — self-correcting, **no
  local snapshot store needed** at this volume.
- ⚠️ `updated_at` does **not** change when key codes are written — never use it to detect changes.

---

## Scope & config

- **Properties are enumerated dynamically** via `getPropertiesWithDeviceFiltersNew` (the active set —
  see the Lynx section), then polled per `propertyId`.
  **No static property list and no `property_id` map.** New properties (rare, gated by physical
  construction) sync zero-touch, and the Lodgify `property_id` is never needed — the write resolves a
  booking from `confirmationCode` and reads `room_type_id` from the Lodgify booking `GET`. The loop
  stays **stateless**: enumerate fresh each run.
- **No reservation-level filtering** (e.g. on `rentalMarketPlace`). Everything in Lynx is
  Lodgify-linked, so every reservation is expected to resolve to a Lodgify booking — filtering would
  risk silently dropping legitimate bookings (affiliate/OTA channels, etc.). Instead, a reservation
  that **doesn't resolve to an existing Lodgify booking is an error → escalate**, never a silent skip.
- Volume: ~28 records/week, up to ~6 months ahead → a few hundred records max. Poll on a schedule,
  low rate + jitter, back off on errors.

### Secrets / config

- **Environment** (set by CDK): the tunable knobs — accountId, per-user id, horizon, send
  window, SLA, grace, alert topic ARN, and the SSM parameter names. Validated at cold start
  (see the Configuration table below).
- **SSM SecureString — credentials** (read at runtime via Powertools, cached ~2 h): Lynx
  username, Lynx password, Lodgify API key. Values are populated out-of-band so they stay
  encrypted at rest and rotatable without redeploy.
- **SSM SecureString — Lynx JWT cache** (`LOCK_LINK_LYNX_TOKEN_PARAM`, read+write at
  runtime): the Lambda persists the minted JWT so cold starts don't repeatedly call
  `login`. The JWT is valid ~95 days; a 401 forces a re-mint and write-back. Zero setup —
  the first-ever run mints normally and creates the parameter.

### Notify / escalation (single sink)

All error cases — a `confirmationCode` that doesn't parse, a booking overdue and still
unmessaged, a booking with no Lynx reservation, a message send that returns an error
envelope, a sent message whose `message_status` lands on `Failed`, a closed thread
(`is_closed`, the guest is unreachable through Lodgify), and the catch-all for whole-run
failures (auth 401, endpoint down, JSON shape changed) — funnel to one `Notifier`, backed by SNS
(`createSnsNotifier` publishes with severity as the subject prefix and a message
attribute). The Lambda consumes the topic by ARN so the topic can later become a shared
cross-workload channel with no code change.

---

## Deployment architecture

- **AWS CDK** app (TypeScript), **not** Serverless Framework. Deployed to the **saas-apps** account
  (`444705667097`; test account `saas-apps-test` `425946675033`), **us-east-1** (the bootstrapped
  region — keep the deploy region aligned with bootstrap).
- **Scheduled Lambda**: `NodejsFunction` (Node 24, esbuild-bundled) on a 15-minute, minute-aligned
  EventBridge cron rule (alignment lets the tick tier its own Lynx polling — see Cadence & Lynx
  tiering). Bundling uses `--conditions=source` so workspace deps bundle from source.
- **Package layout — `infra/` + `src/` split** (single package):
  - `infra/` — CDK app + stack (`app.ts`, `stack.ts`). May depend on `src/`.
  - `src/` — runtime/handler code, where the sync logic grows. **eslint bans importing
    `aws-cdk-lib`/`constructs` or `infra/` from `src/`** (one-directional boundary) — generated by
    the repo-kit `cdk` feature into `eslint.config.d/`.
- **Observability**: `@twin-digital/observability-lib` (`withObservability(handler, { serviceName })`;
  logger/metrics injected on the handler `context`).
- **CI/CD**: GitHub Actions. Deploys are tool-typed turbo tasks — serverless apps run
  `deploy:serverless`, CDK apps run `deploy:cdk` (membership is implicit: a package belongs to a
  task iff it defines it). `deploy.yaml` has separate `production` (serverless) and `cdk` jobs; the
  `cdk` job assumes `GitHubActionsCdkDeployRole` (saas-apps) via OIDC and runs
  `turbo run deploy:cdk -- --all --require-approval never`. CDK bootstrap + the OIDC role live in
  the `twin-digital/aws` Terraform repo.
- Deploys are **continuous on merge to main** (not gated on changesets releases) — see
  twin-digital/opus#189 for the future release-gating item.

---

## Module layout

- `lynx/` — client (`login` + `TokenCache` seam, `listProperties`, `listReservations` for
  `upcoming`/`current`, `listSmartLocks` for the lock set), zod schemas, and
  `createSsmTokenCache` (durable JWT cache backed by SSM SecureString).
- `lodgify/` — client (`listBookings`, `getBooking`, `putKeyCodes`, `getThread`,
  `addBookingMessage`), zod schemas, the vendored OpenAPI (`lodgify.openapi.json`, **v2 only** —
  the v1 messaging endpoint is modeled by hand from live probing), and the `pull-spec` refresh
  tool. `addBookingMessage` parses the response body for the success/error envelope (the HTTP
  status is always 200 — see the messaging section).
- `sync/` — `resolveBookingId(confirmationCode)`, `checkReadiness` (every lock covered, all
  `success`), key-code encode/decode (the `key_code` convention), message composition + the
  deterministic `message_id` derivation, `runSync` (capture + message phases), and
  `createSnsNotifier`.
- `config.ts` — env-sourced, zod-validated `LockLinkConfig`; `secrets.ts` — Powertools
  SSM SecureString reads with a 2 h TTL.
- `functions/sync.ts` — the Lambda handler: `loadConfig` → build notifier → `loadSecrets`
  → build clients → `runSync`, wrapped in try/notify/rethrow so a whole-run failure
  reaches the escalation sink.

## Configuration

Operational config (all required, validated at cold start):

| Env var                                | Purpose                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `LOCK_LINK_ACCOUNT_ID`                 | Lynx umbrella account id (drives the join suffix)                          |
| `LOCK_LINK_USER_ID`                    | Lynx per-user id sent as `hostId`/`loggedInUserId`                         |
| `LOCK_LINK_HORIZON_DAYS`               | Fill gaps arriving within this window (14)                                 |
| `LOCK_LINK_SEND_HOURS`                 | Message the guest inside this many hours before arrival (72)               |
| `LOCK_LINK_LYNX_SLOW_INTERVAL_MINUTES` | Lynx re-check interval for gaps outside the send window (60)               |
| `LOCK_LINK_SLA_HOURS`                  | Escalate a still-unmessaged booking within this many hours of arrival (48) |
| `LOCK_LINK_GRACE_MINUTES`              | Don't flag brand-new bookings (30)                                         |
| `LOCK_LINK_ALERT_TOPIC_ARN`            | SNS topic the Notifier publishes to                                        |
| `LOCK_LINK_LYNX_USERNAME_PARAM`        | SSM SecureString name — Lynx username                                      |
| `LOCK_LINK_LYNX_PASSWORD_PARAM`        | SSM SecureString name — Lynx password                                      |
| `LOCK_LINK_LODGIFY_API_KEY_PARAM`      | SSM SecureString name — Lodgify API key                                    |
| `LOCK_LINK_LYNX_TOKEN_PARAM`           | SSM SecureString name — durable Lynx JWT cache                             |

`LOCK_LINK_SEND_HOURS` must exceed `LOCK_LINK_SLA_HOURS`: the send window has to open before
the escalation clock runs out, so a healthy booking always gets send attempts before anyone
is paged.

SSM SecureString **values** are populated out-of-band on initial setup (CFN never sees
secret material); the stack grants the Lambda `ssm:GetParameter` on the named parameters
plus `kms:Decrypt` scoped by `kms:ViaService = ssm.<region>.amazonaws.com`.

## Open questions / follow-ups

- **Verify OTA channel push on the first real OTA-sourced send** (documented behavior of
  `send_notification`, not yet observed live; watch the message's `route`).
- Stretch: **best-effort code freshness at send time** — re-check Lynx before messaging and use
  the fresh codes if reachable, the captured ones if not. Rotation after capture is expected to
  be an anomaly; MVP assumes codes are static once set.
- Stretch: **Lodgify webhooks as a second watch path for imminent bookings.** Instant detection
  isn't valuable on its own (we wait on Lynx provisioning regardless), but a new-booking webhook
  could kick off a tighter watch loop — short-interval Lynx re-checks — for bookings arriving
  soon or already past check-in, cutting the one-tick detection delay when it matters most.
  Needs the same contract-proving treatment the messaging API got.
- Confirm whether Lynx ever **rotates** a code after it's set (validates the static-code
  assumption / whether a scheduled reconciliation pass is needed). The calibration metrics and
  observed behaviour also drive tuning of the tick rate, `SEND_HOURS`, and the grace values.
- Per-property Lynx error isolation so a single-property outage doesn't abort the
  whole tick — tracked as opus#201.
- Parameterize (or remove, once the shared cross-workload SNS topic exists) the alert
  email currently hardcoded in the stack — tracked as opus#202.
- A `cdk diff` step on PRs + a `production` approval gate are nice deploy-maturity adds.

## Reference

- A throwaway `lynx-getreservations.sh` curl script (used to prove the Lynx endpoint)
  exists in the repo root of the exploration checkout — handy for poking the API by
  hand with a pasted token.
- A throwaway `lodgify-messaging-probe.mjs` script (used to prove the messaging contract:
  thread read-back, `message_id` idempotency, `send_notification` behavior, `key_code`
  round-trip) exists alongside it — subcommands for `booking`/`thread`/`send`/`keycode`.
