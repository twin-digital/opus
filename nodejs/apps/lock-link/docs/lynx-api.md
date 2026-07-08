# Lynx API — integration reference

The Lynx (smart-lock management, internally "Cat") side of lock-link. This is the **how** — every
endpoint, wire shape, and quirk we depend on. For what the system does with this data and when,
see [architecture.md](./architecture.md).

## Provenance

Lynx has **no public API and no webhooks**. Its dashboard frontend calls a private JSON API that
we call directly — every contract here was reverse-engineered from live dashboard traffic and is
proven against live data. The UI renders codes with a glyph font (display-layer obfuscation); the
JSON returns them as **plaintext**, so no scraping or OCR is needed.

Because the API is unofficial, two standing rules apply:

- **Wire shapes drift.** Health-metadata types have changed repeatedly (`isJammed` swung
  boolean → int → other; `batteryLevel` swung number → string). Zod schemas model **only the
  fields we consume** and strip the rest on parse (zod's default `.strip()`), so drift in fields
  we don't read can't block the sync. Add fields back — typed against observed wire data at the
  time — when a consumer lands.
- **Keep a low profile.** Poll at modest rates with jitter, back off on errors, and log in
  rarely (the token cache exists for this as much as for latency).

A throwaway `lynx-getreservations.sh` curl script (used to prove the reservations endpoint)
exists in the repo root of the exploration checkout — handy for poking the API by hand with a
pasted token.

## Auth

- `POST https://api.getlynx.co/ProdV1.1/api/v1/auth/login`
- Body: plaintext JSON `{ "email": "...", "password": "..." }` (the Lynx account identifier is an
  email address — the `LOCK_LINK_LYNX_USERNAME_PARAM` env var historically names it `username`,
  but the wire field is `email`).
- Response: a **JWT in the `x-auth-token` response header** (not the body). `exp ≈ 95 days`.
- Use as `Authorization: Bearer <token>` on subsequent calls.
- **Cache the token** (durably, in SSM — see architecture.md); **re-mint on `401`**. HTTPS only;
  creds/token never logged. The `LynxLogins` metric counts every mint; more than ~4/year is
  churn worth investigating.

## ID model (subtle — mirror the site)

- **`222262` = the umbrella Account ID** (shown in the Lynx UI header). It doubles as the primary
  user's id and is the value baked into every `confirmationCode` suffix.
- **Per-user ids are distinct** (e.g. `232753` for the dedicated automation user). These go in
  API request bodies as `hostId` / `loggedInUserId`.
- Decision: **mirror what the dashboard does** — account id for suffix parsing, per-user id in
  request bodies. Don't try to rationalize why they're sometimes interchangeable.

## The confirmationCode → Lodgify join

Lynx never returns Lodgify's numeric booking id directly, but embeds it in `confirmationCode`:

```
confirmationCode = <lodgifyBookingId> + "VK" + <accountId>
20559349VK222262 = 20559349        +  VK  +  222262
```

- **Rule:** strip the trailing `VK<accountId>`; the leading numeric run is the Lodgify booking id.
- The `VK<accountId>` suffix is a **constant per Lynx account** (NOT channel-specific) — confirmed
  across Expedia, direct-Lodgify, and Booking.com reservations. Every `confirmationCode` must end
  with it; one that doesn't → escalate (free integrity check).
- Derive the suffix from the configured `accountId`; don't hardcode the literal (account-scoped).

## Read reservations — `getReservationsByProperty`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getReservationsByProperty` — the query params go
  in the JSON body (not the URL); a read modeled as a POST query.
- Body: `{ "hostId": "<per-user id>", "loggedInUserId": "<per-user id>", "propertyId": <int>, "type": "current", "page": "1", "perPage": 5 }`
- Paginated — see `paginationInfo` (`total`, `totalPages`, `page`, `perPage`). Bump `perPage` or
  loop pages; stop on the authoritative record count or an empty page, not `totalPages`.
- `type` ∈ `upcoming` | `current` | `past`. **Poll `upcoming` (primary — get codes in before
  arrival) and `current` (catches same-day / in-house).** ⚠️ **`past` returns `accessCodes: []`**
  (codes are cleared after checkout) — skip it, and don't let empty-on-past trip escalation.
- Access codes: `data.reservations[].accessCodes[]` — one entry per lock, each with `code`
  (plaintext, e.g. `"9234"`; usually uniform across a reservation's locks but legitimately
  differs per lock), `lockName`, `syncToLockStatus` (the readiness signal) and
  `syncToCloudStatus`. Lynx additionally emits `isCodeSet` / `isHubCommunicated` int-booleans;
  not modeled in the schema.
- ⚠️ A lock's `code` is assigned up front, **even while the lock is still `"scheduled"`**
  (assigned but not yet pushed to the hardware) — code presence is **not** a readiness signal;
  `syncToLockStatus: "success"` is. Seen states so far: `scheduled` (pending), `success` (live).
- ⚠️ **No event timestamps anywhere.** Reservations carry check-in/out times and codes carry an
  access validity window (`accessStart`/`accessEnd`), but there is no created-at, assigned-at, or
  synced-at — the API exposes current state only, and `past` clears it. Provisioning latency can
  only be measured by observing transitions live (the calibration metrics exist for this).

### Reservation fields consumed

| Field                                   | Example            | Use                                                                 |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `confirmationCode`                      | `20559349VK222262` | **join key** → Lodgify booking id (see above)                       |
| `accessCodes[].code`                    | `9234`             | the door code(s) to capture — one entry per lock                    |
| `accessCodes[].lockName`                | `Front Door`       | per-lock label (encoding + guest message when codes differ)         |
| `bookingId`                             | `10490339`         | Lynx-internal id (NOT Lodgify's)                                    |
| `guestFirstName/LastName`, `guestEmail` | `Heather Cobb`     | sanity-match against Lodgify                                        |
| `checkInTimestamp`/`checkOutTimestamp`  | `2026-06-15/16`    | escalation clock + sanity-match                                     |
| `rentalMarketPlace`                     | `LODGIFY`          | constant (the PMS), not a key                                       |
| `bookingSource`                         | `12`               | int channel code (Expedia here); useful to spot non-Expedia records |

## Lock set & health — `getSmartLocksByPropertyWithStatus`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getSmartLocksByPropertyWithStatus`
- Body: `{ hostId, loggedInUserId, propertyId, page, perPage, isHubAndLockStatusRequired: true, provisioningInfo: true, skipDeviceStatusApiCall: false }`
- Returns `data.smartLocksInfo[]` — **the property's full lock set** (`paginationInfo.total` =
  lock count; property `72230` has **3**: Dalton Door, 4th Street Lofts, Front Door). This is the
  **denominator** for "all locks ready" (how many locks a reservation's codes must cover).
- Each entry has `lockName` (the join key against a reservation's per-lock access-code entry)
  plus health metadata: `provisionStatus`, `connectivityStatus`, `batteryLevel`, `isJammed`,
  `provisioningInfo`, `syncToLockStatus`, `lockModelUniqueName`. The sync consumes only
  `lockName` (see the wire-drift rule above); health metadata is escalation-enrichment material
  when a consumer lands.
- ⚠️ A lock's `erCode` here is its **base/default** code, **not** the per-reservation guest code
  (which lives in the reservation's `accessCodes[].code`) — never guest material.

## Property list — `getPropertiesWithDeviceFiltersNew`

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getPropertiesWithDeviceFiltersNew`
- Body: `{ hostId, loggedInUserId, searchKey: "", sortBy: { by: "name", order: "asc" }, page, perPage, filters: {} }`
- Returns `data.properties[]` — `uniquePropertyId` (the `propertyId`), `name`, address,
  `timeZone`, `propertyStatus`. **Enumerate the active set** (`propertyStatus == "ACTIVE"`) → the
  list of `propertyId`s to poll. (Account `222262` currently: 72229 Markham, 72230 Dalton,
  72231 Lakeshore, 72232 Rex.) This is the dynamic enumeration source — no static list.
