# lock-link — architecture & design

`@twin-digital/lock-link` keeps smart-lock access codes in sync from **Lynx** (smart-lock /
property-management system, internally "Cat") into **Lodgify** (short-term-rental PMS / channel
manager, internally "Hotel"). It replaces a manual workflow: a property manager reads each
reservation's door code off the Lynx dashboard and pastes it into the matching Lodgify booking.

The scheduled Lambda runs the full read → resolve → validate → diff → write loop described
below. The integration contracts are all proven against live data.

---

## Data flow

**Lodgify-driven, gap-fill.** Drive from the _official_ Lodgify API and touch the unofficial Lynx API
only for actual gaps — so Lynx usage scales with new near-term bookings (not calendar size) and
quiesces to **zero** once everything in-horizon already has a code.

```
            scheduled Lambda (lock-link, cron)
  1. Lodgify: list Upcoming bookings within a horizon (e.g. next 1-2 weeks),
     status Booked, with NO key_code   ──►  the "gap set"
  2. if gaps → Lynx: pull the properties' `upcoming` reservations, index by
     confirmationCode, resolve each gap's code + provisioning readiness
  3. ready (all locks success) → Lodgify: PUT keyCodes
     not ready + near arrival     → notify (escalate)
```

At steady state (no in-horizon gaps) step 2 is skipped entirely — no Lynx calls. The Lodgify→Lynx
join uses `confirmationCode` (it embeds the Lodgify booking id); the Lodgify→Lynx `property_id` map is
only an optimization (query one Lynx property instead of all four when filling a gap).

> [!IMPORTANT]
> **We assume door codes are static once set.** A Lodgify booking that already has a `key_code` is
> treated as done and never re-checked, so a _rotation_ of the code in Lynx after the fact would not
> propagate. The data suggests codes are assigned once and stable. If that proves untrue, add a
> scheduled reconciliation that compares Lynx vs Lodgify codes for the in-horizon set.

---

## Lynx (source) — reverse-engineered API

Lynx has no public API/webhooks, but its dashboard frontend calls a private JSON endpoint we can
call directly. **The UI renders codes with a glyph font (display-layer obfuscation); the JSON
returns them as plaintext** — so no scraping or OCR is needed.

### Auth

- `POST https://api.getlynx.co/ProdV1.1/api/v1/auth/login`
- Body: plaintext JSON `{ "username": "...", "password": "..." }`
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
- Access code: `data.reservations[].accessCodes[].code` (plaintext, e.g. `"9234"`; same code across
  all of a reservation's locks). Each entry also carries provisioning status: `isCodeSet`,
  `isHubCommunicated`, `syncToLockStatus`, `syncToCloudStatus`.

### Lock set & health — `getSmartLocksByPropertyWithStatus`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getSmartLocksByPropertyWithStatus`
- Body: `{ hostId, loggedInUserId, propertyId, page, perPage, isHubAndLockStatusRequired: true, provisioningInfo: true, skipDeviceStatusApiCall: false }`
- Returns `data.smartLocksInfo[]` — **the property's full lock set** (`paginationInfo.total` = lock
  count; property `72230` has **3**: Dalton Door, 4th Street Lofts, Front Door) plus per-lock health:
  `provisionStatus`, `connectivityStatus` (ONLINE/OFFLINE), `batteryLevel`, `isJammed`,
  `provisioningInfo`, `syncToLockStatus`, `lockModelUniqueName` (e.g. `SCHLAGE_ENCODE`, `REMOTELOCK_ACS`).
- This gives the **denominator** for "all locks ready" (how many locks a reservation must cover) and
  the health context for escalation messages.
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
| `accessCodes[].code`                    | `9234`             | the door code to push                                               |
| `accessCodes[].lockName`                | `Front Door`       | 3 locks per reservation (see invariant)                             |
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
  from `getSmartLocksByPropertyWithStatus`), each with **`syncToLockStatus: "success"`** (`isCodeSet:
1`), all the same `code`. ⚠️ The `code` is assigned up front and **uniform across all locks even
  while a lock is `"scheduled"`** (assigned but not yet pushed to the lock) — so "all locks have the
  same code" is **not** a readiness signal; **`syncToLockStatus: "success"` is.** Only when all locks
  are `success` do we push to Lodgify — **never push a partial/unsynced code** (a code that opens
  some doors is worse than none). Seen states so far: `scheduled` (pending), `success` (live).
- **Not ready is normal**, not an error — skip and re-check next run. The schedule is the retry and
  the stateless diff converges.
- **Escalate only when not-ready is overdue**, computed statelessly from `checkInTimestamp` (+ the
  booking `createdAt` for a grace window): escalate if `hoursToArrival <= SLA` (target: codes ready
  **≥24h before arrival**) **and** `bookingAge >= GRACE` (so brand-new / same-day bookings aren't
  flagged the instant they appear; after the grace, a still-bare imminent booking _is_ urgent).
  Severity ramps with proximity (info > 24h, warn inside the window, critical < a few hours / past
  arrival). Enrich the message with lock health (offline / jammed / low battery vs just slow).

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

## Lodgify (destination) — public API v2

- Auth: **`X-ApiKey: <key>`** header (Lodgify dashboard → Settings → Public API). Not a bearer token.

### Write the door code

- `PUT https://api.lodgify.com/v2/reservations/bookings/{id}/keyCodes`
- `{id}` = the numeric booking number from the join rule (int32).
- Body: `{ "rooms": [ { "room_type_id": <int>, "key_code": "<code>" } ] }`
- Returns **200** with a rooms-only echo (`BookingKeyCodeDto = { rooms: [{ room_type_id,
key_code }] }`, per the vendored OpenAPI) — **not** a full booking → read back
  `rooms[].key_code` to confirm the write (no separate GET needed).
- Errors → notify sink: **404** booking/room not found (stale parsed id / room_type_id); **400**
  typed `code` (`ValidationError`/`ArgumentError`/…) + `message` + `correlation_id`; **401** bad key.
- One code per reservation maps cleanly to a single-room booking. (Lynx's 3 locks are physical
  hardware; Lodgify only cares about the booking's room(s).)

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
  to the Lynx code and **PUT only when they differ** — self-correcting, **no local snapshot store
  needed** at this volume.
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

- **Environment** (set by CDK): the tunable knobs — accountId, per-user id, horizon, SLA,
  grace, alert topic ARN, and the SSM parameter names. Validated at cold start
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
not ready, a booking with no Lynx reservation, and the catch-all for whole-run failures
(auth 401, endpoint down, JSON shape changed) — funnel to one `Notifier`, backed by SNS
(`createSnsNotifier` publishes with severity as the subject prefix and a message
attribute). The Lambda consumes the topic by ARN so the topic can later become a shared
cross-workload channel with no code change.

---

## Deployment architecture

- **AWS CDK** app (TypeScript), **not** Serverless Framework. Deployed to the **saas-apps** account
  (`444705667097`; test account `saas-apps-test` `425946675033`), **us-east-1** (the bootstrapped
  region — keep the deploy region aligned with bootstrap).
- **Scheduled Lambda**: `NodejsFunction` (Node 24, esbuild-bundled) on an hourly EventBridge rule.
  Bundling uses `--conditions=source` so workspace deps bundle from source.
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
- `lodgify/` — client (`listBookings`, `getBooking`, `putKeyCodes`), zod schemas, the
  vendored OpenAPI (`lodgify.openapi.json`), and the `pull-spec` refresh tool.
- `sync/` — `resolveBookingId(confirmationCode)`, `checkReadiness` (all locks `success`,
  same code, non-empty), `runSync` (the Lodgify-driven gap-fill loop), and
  `createSnsNotifier`.
- `config.ts` — env-sourced, zod-validated `LockLinkConfig`; `secrets.ts` — Powertools
  SSM SecureString reads with a 2 h TTL.
- `functions/sync.ts` — the Lambda handler: `loadConfig` → build notifier → `loadSecrets`
  → build clients → `runSync`, wrapped in try/notify/rethrow so a whole-run failure
  reaches the escalation sink.

## Configuration

Operational config (all required, validated at cold start):

| Env var                           | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `LOCK_LINK_ACCOUNT_ID`            | Lynx umbrella account id (drives the join suffix)  |
| `LOCK_LINK_USER_ID`               | Lynx per-user id sent as `hostId`/`loggedInUserId` |
| `LOCK_LINK_HORIZON_DAYS`          | Fill gaps arriving within this window (14)         |
| `LOCK_LINK_SLA_HOURS`             | Escalate a bare booking within this hours (48)     |
| `LOCK_LINK_GRACE_MINUTES`         | Don't flag brand-new bookings (30)                 |
| `LOCK_LINK_ALERT_TOPIC_ARN`       | SNS topic the Notifier publishes to                |
| `LOCK_LINK_LYNX_USERNAME_PARAM`   | SSM SecureString name — Lynx username              |
| `LOCK_LINK_LYNX_PASSWORD_PARAM`   | SSM SecureString name — Lynx password              |
| `LOCK_LINK_LODGIFY_API_KEY_PARAM` | SSM SecureString name — Lodgify API key            |
| `LOCK_LINK_LYNX_TOKEN_PARAM`      | SSM SecureString name — durable Lynx JWT cache     |

SSM SecureString **values** are populated out-of-band on initial setup (CFN never sees
secret material); the stack grants the Lambda `ssm:GetParameter` on the named parameters
plus `kms:Decrypt` scoped by `kms:ViaService = ssm.<region>.amazonaws.com`.

## Open questions / follow-ups

- Confirm whether Lynx ever **rotates** a code after it's set (validates the static-code
  assumption / whether a scheduled reconciliation pass is needed). Tune the cron cadence
  once real behaviour is observed.
- Per-property Lynx error isolation so a single-property outage doesn't abort the
  whole tick — tracked as opus#201.
- Parameterize (or remove, once the shared cross-workload SNS topic exists) the alert
  email currently hardcoded in the stack — tracked as opus#202.
- A `cdk diff` step on PRs + a `production` approval gate are nice deploy-maturity adds.

## Reference

- A throwaway `lynx-getreservations.sh` curl script (used to prove the Lynx endpoint)
  exists in the repo root of the exploration checkout — handy for poking the API by
  hand with a pasted token.
