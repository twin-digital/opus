# Lynx API — integration reference

The Lynx (smart-lock management, internally "Cat") side of lock-link. This is the **how** — every
endpoint, wire shape, and quirk we depend on. For what the system does with this data and when,
see [architecture-sure-lock.md](./architecture-sure-lock.md).

## Provenance

Lynx has **no public API and no webhooks**. Its dashboard frontend calls a private JSON API that
we call directly — every contract here was reverse-engineered from live dashboard traffic and is
proven against live data.

Because the API is unofficial, two standing rules apply:

- **Wire shapes drift.** The API is unofficial and unsupported, so field types and shapes can
  change without notice — minimize dependence on concrete specifics. Zod schemas model **only
  the fields we consume** and strip the rest on parse (zod's default `.strip()`), so drift in
  fields we don't read can't block the sync. Add fields back — typed against observed wire data
  at the time — when a consumer lands.
- **Keep a low profile.** Poll at modest rates with jitter, back off on errors, and log in
  rarely (the token cache exists for this as much as for latency).

A throwaway `lynx-getreservations.sh` curl script (used to prove the reservations endpoint)
exists in the repo root of the exploration checkout — handy for poking the API by hand with a
pasted token.

## Auth

- `POST https://api.getlynx.co/ProdV1.1/api/v1/auth/login`
- Body: plaintext JSON `{ "email": "...", "password": "..." }` (the Lynx account identifier is an
  email address — the `LL_LYNX_USERNAME_PARAM` env var historically names it `username`,
  but the wire field is `email`).
- Response: a **JWT in the `x-auth-token` response header** (not the body). `exp ≈ 95 days`.
- Use as `Authorization: Bearer <token>` on subsequent calls.
- **Cache the token** (durably, in SSM — see architecture-sure-lock.md); **re-mint on `401`**. HTTPS only;
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
| `guestFirstName/LastName`, `guestEmail` | `Alice Anderson`   | sanity-match against Lodgify                                        |
| `checkInTimestamp`/`checkOutTimestamp`  | `2026-06-15/16`    | escalation clock + sanity-match                                     |
| `rentalMarketPlace`                     | `LODGIFY`          | constant (the PMS), not a key                                       |
| `bookingSource`                         | `12`               | int channel code (Expedia here); useful to spot non-Expedia records |

## Access-code email & SMS status — `getAccessCodeEmailStatus` / `getAccessCodeSMSStatus`

Lynx's own record of whether it delivered a reservation's door code to the guest, one endpoint
per channel. Captured from live dashboard traffic (2026-07-11); samples sanitized (reservation
ids replaced with fakes).

- `POST https://api.getlynx.co/ProdV1.1/dashboard/getAccessCodeEmailStatus` (email)
- `POST https://api.getlynx.co/ProdV1.1/dashboard/getAccessCodeSMSStatus` (SMS) — identical
  body and response shape. ⚠️ The SMS response's payload key is **also `accessCodeEmail`**
  (evidently copied on Lynx's side) — one shared schema models both.
- Body: `{ "hostId": "<per-user id>", "loggedInUserId": "<per-user id>", "propertyId": 72230, "bookingType": 1, "reservationId": 10490339 }`
  - `reservationId` is the **Lynx-internal reservation id** — the reservations list's
    `bookingId` field, NOT the Lodgify booking id (confirmed).
  - `bookingType` observed as the constant `1`; meaning unknown — mirror the dashboard.
- Response: `data.accessCodeEmail = { reservationId, sentStatus, errorMessage }`, one
  reservation and one channel per call.

| `sentStatus` | Meaning (inferred from live samples) |
| ------------ | ------------------------------------ |
| `0`          | not yet attempted                    |
| `1`          | sent                                 |
| `2`          | error — the send failed              |

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "accessCodeEmail": { "reservationId": 10490339, "sentStatus": 1, "errorMessage": "" }
  }
}
```

- ⚠️ `errorMessage` observed **empty even when `sentStatus` is `2`** — expect no failure detail
  beyond the status itself.
- ⚠️ **No timestamp** — current state only, like the rest of the API; the send _time_ is only
  measurable by observing the `0 → 1` transition live.
- ⚠️ `sentStatus: 1` means Lynx **dispatched** the message, not that the guest received it — a
  relay address silently discarding an email would presumably still read `1`.
- Statuses are **retained after checkout** (confirmed against old reservations) — unlike
  `accessCodes`, which `past` reservations clear — so a retroactive sweep of past reservations
  works (see
  [architecture-sure-lock.md](./architecture-sure-lock.md#lynx-email--sms-delivery-status)).

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

## User management & task codes

The fallback-code pool planned for the guest-messaging extension (sure-lock itself makes no
Lynx writes — see [architecture-sure-lock.md](./architecture-sure-lock.md)) rides on Lynx's
task-code user mechanism. Request/response shapes below are captured from live dashboard
traffic (2026-07-10); samples are anonymized (names, emails, phone numbers replaced with fakes).
⚠️ The one unverifiable behavior — whether/when a deleted user's code actually leaves lock
hardware — is covered under the delete endpoint below.

### List available task codes — `getTaskNotificationCodesForHost`

- `POST https://api.getlynx.co/ProdV1.1/smartworkflows/getTaskNotificationCodesForHost`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "page": 1, "perPage": 10 }`
  (note: the **account id**, not the per-user id — mirror the dashboard)
- Returns only the **available** codes — assigning one (user creation) removes it from the list;
  deleting the user returns it immediately. Sample below shows 7 while one automation user holds
  the 8th. The set is dynamic: treat as live truth, never assume the total.
- Each entry's `id` is the `tnAccessCodeIdDB` passed to user creation.
- Each entry's **`accessCode` is NOT a door code** — it serves unrelated task workflows (e.g. a
  housekeeper marking a room cleaned), is never given to guests, and grants no room access. The
  **door PIN** lives on the user, in `getSecondaryUserInformation` →
  `secondaryUserAccessCodeInfo.accessCode` (below).
- `createdDate`/`modifiedDate` are epoch-second **strings**; `ruleId`/`deletedDate` observed
  `null`, `isDeleted` an int-boolean.

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "taskNotificationCodes": [
      {
        "id": 12345,
        "ruleId": null,
        "accessCode": "1111",
        "hostUserId": 222262,
        "isDeleted": 0,
        "createdDate": "1758225170",
        "modifiedDate": "1758225170",
        "deletedDate": null
      },
      {
        "id": 12346,
        "ruleId": null,
        "accessCode": "2222",
        "hostUserId": 222262,
        "isDeleted": 0,
        "createdDate": "1760131513",
        "modifiedDate": "1760131513",
        "deletedDate": null
      }
      // …5 more of the same shape
    ],
    "paginationInfo": { "perPage": 10, "totalPages": 1, "page": 1, "total": 7 }
  },
  "paginationInfo": { "perPage": 10, "totalPages": 1, "page": 1, "total": 7 }
}
```

### List groups — `getGroupList`

- `POST https://api.getlynx.co/ProdV1.1/secondaryGroups/getGroupList`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "filters": { "searchKey": "" }, "page": 1, "perPage": 10 }`
- A group grants access to a set of locks; the reconciler needs **one room-scoped group per
  property**. ⚠️ **Prerequisite: none exist yet** — the observed set is all-properties defaults
  plus a `Dalton` group that is not correctly configured. All four room groups must be created
  (dashboard) before the reconciler can target anything.
- Live enumeration works, but group ids are construction-rate-stable — static config
  (`LL_FB_GROUP_MAP`) is simpler and avoids matching on display names.

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "groupInfo": [
      {
        "groupId": 22221,
        "groupName": "Lynx - All Properties",
        "hostId": 222262,
        "enabledWhiteLabel": 0,
        "isDefault": 1
      },
      { "groupId": 22222, "groupName": "Dalton", "hostId": 222262, "enabledWhiteLabel": 0, "isDefault": 0 },
      { "groupId": 22223, "groupName": "All properties", "hostId": 222262, "enabledWhiteLabel": 0, "isDefault": 0 }
    ]
  },
  "paginationInfo": { "perPage": 10, "totalPages": 1, "page": 1, "total": 3 }
}
```

### Create user — `addSecondaryUser`

- `POST https://api.getlynx.co/ProdV1.1/secondaryUsers/addSecondaryUser`
- Field notes: `groupRestrictions` = a single-element array with the room's group id;
  `tnAccessCodeIdDB` = the task-code `id` from the available list; `roleId` 6 = "Guest"
  (configurable constant); `enableGroupRestrictions` + `linkGroupsOnCreation` true;
  `holdAccess` is the **string** `"0"`; `phoneNumber` `"1"` is accepted; `emailLoginAccess` /
  `isAdmin` false; `previousRestrictions` / `tags` arrays (both unused by us);
  `acl` an empty object. Here `hostId`/`loggedInUserId` are **numbers**, not strings.

```json
{
  "hostId": 222262,
  "loggedInUserId": 222262,
  "firstName": "FirstName",
  "lastName": "LastName",
  "phoneNumber": "1",
  "email": "emailaddress@twindigital.io",
  "previousRestrictions": [],
  "tags": [],
  "roleId": 6,
  "enableGroupRestrictions": true,
  "linkGroupsOnCreation": true,
  "groupRestrictions": [22222],
  "holdAccess": "0",
  "tnAccessCodeIdDB": 12346,
  "emailLoginAccess": false,
  "isAdmin": false,
  "acl": {}
}
```

Response:

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": { "uniqueSecondaryUserId": 111111 }
}
```

### List users — `getSecondaryUsersList`

- `POST https://api.getlynx.co/ProdV1.1/secondaryUsers/getSecondaryUsersList`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "filters": { "searchKey": "" }, "page": 1, "perPage": 10 }`
- Paginated (`data.secondaryUserList.count` + `rows`, plus the top-level `paginationInfo`).
- This is the reconciler's **read-before-write source**: automation-owned users are recognized
  by the deterministic name/email convention; everything else (owners, housekeepers, property
  managers — see the role variety below) is foreign and untouchable.

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "secondaryUserList": {
      "count": 12,
      "rows": [
        {
          "uniqueSecondaryUserId": 111111,
          "firstName": "FirstName",
          "lastName": "LastName",
          "userId": 222262,
          "email": "emailaddress@twindigital.io",
          "phone": "1",
          "roleInfo": { "uniqueRoleId": 6, "name": "Guest", "icon": "Guest.png" }
        },
        {
          "uniqueSecondaryUserId": 111112,
          "firstName": "emergency",
          "lastName": "user-3",
          "userId": 222262,
          "email": "support+emergency-3@twindigital.io",
          "phone": "1",
          "roleInfo": { "uniqueRoleId": 6, "name": "Guest", "icon": "Guest.png" }
        },
        {
          "uniqueSecondaryUserId": 111113,
          "firstName": "Twin Digital",
          "lastName": "Operations",
          "userId": 222262,
          "email": "support@twindigital.io",
          "phone": "218-555-0148",
          "roleInfo": { "uniqueRoleId": 11, "name": "Staff", "icon": "Staff.png " }
        },
        {
          "uniqueSecondaryUserId": 111114,
          "firstName": "Dana",
          "lastName": "Smith",
          "userId": 222262,
          "email": "dana.smith@example.com",
          "phone": "218-555-0117",
          "roleInfo": { "uniqueRoleId": 12, "name": "Owner", "icon": "property-manager.png" }
        },
        {
          "uniqueSecondaryUserId": 111115,
          "firstName": "Hannah",
          "lastName": "Harris",
          "userId": 222262,
          "email": "hannah.harris@example.com",
          "phone": "218-555-0156",
          "roleInfo": { "uniqueRoleId": 7, "name": "Maintenance", "icon": "Handyman.png" }
        },
        {
          "uniqueSecondaryUserId": 111116,
          "firstName": "Maria",
          "lastName": "Clark",
          "userId": 222262,
          "email": "maria.clark@example.com",
          "phone": "218-555-0161",
          "roleInfo": { "uniqueRoleId": 2, "name": "Housekeeper", "icon": "cleaning.png" }
        }
        // …remaining rows elided: Guest, Housekeeper, and Property Manager roles of the same shape
      ]
    }
  },
  "paginationInfo": { "perPage": 10, "totalPages": 2, "page": 1, "total": 12 }
}
```

Observed roles so far: 2 Housekeeper, 6 Guest, 7 Maintenance, 9 Property Manager, 11 Staff,
12 Owner. Note `roleInfo.icon` has a trailing space in at least one row (`"Staff.png "`) — the
usual wire-drift caution applies; model only what we consume.

### Provisioning status — `getPendingCodeInfoForSecondaryUserLiveCodes`

- `POST https://api.getlynx.co/ProdV1.1/secondaryUsers/getPendingCodeInfoForSecondaryUserLiveCodes`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "uniqueSecondaryUserId": 111111 }`
- **Per-user** provisioning check — the reconciler's "standing" signal. `pendingInfo: []` means
  the user's code is live on every lock; otherwise each entry names a lock still waiting:

```json
{ "status": true, "errorCodeId": 0, "errorMessage": "", "data": { "pendingInfo": [] } }
```

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "pendingInfo": [
      { "lockIdDB": 44441, "lockName": "Dalton Door", "propertyId": 72230, "propertyAddress": "123 Main Street" },
      { "lockIdDB": 44442, "lockName": "4th Street Lofts", "propertyId": 72230, "propertyAddress": "123 Main Street" },
      { "lockIdDB": 44443, "lockName": "Front Door", "propertyId": 72230, "propertyAddress": "123 Main Street" }
    ]
  }
}
```

### Read a user (including the door PIN) — `getSecondaryUserInformation`

- `POST https://api.getlynx.co/ProdV1.1/secondaryUsers/getSecondaryUserInformation`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "allowedSecondaryUsers": [111111], "filters": { "searchKey": "" } }`
- **`data.secondaryUserList[0].secondaryUserAccessCodeInfo.accessCode` is the door PIN** — this
  is where the reconciler reads the code it caches for issuance. `isCodeChangeInProgress` is an
  int-boolean worth respecting before trusting the value.
- `taskNotificationCodeInfo` echoes the assigned task code (id + its non-door `accessCode`);
  `groupRestrictions` echoes the room group. The response also carries a large `acl` object and
  several RFID config blocks — the wire-drift rule applies double here: model only the fields we
  consume, strip the rest.

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": {
    "secondaryUserList": [
      {
        "uniqueSecondaryUserId": 111111,
        "firstName": "FirstName",
        "lastName": "LastName",
        "email": "emailaddress@twindigital.io",
        "phone": "1",
        "roleInfo": { "uniqueRoleId": 6, "name": "Guest", "icon": "Guest.png" },
        "emailLoginAccess": 0,
        "secondaryUserAccessCodeInfo": {
          "accessCodeId": 33333,
          "accessCode": "1234",
          "isCodeChangeInProgress": 0
        },
        "taskNotificationCodeInfo": {
          "taskNotificationCodeId": 12346,
          "taskNotificationCode": "2222",
          "isCodeChangeInProgress": 0
        },
        "isAdministrator": 0,
        "emailSentStatus": 0,
        "smsSentStatus": 0,
        "holdAccess": 0,
        "acl": {
          "...": "large permission map — elided; VALUEs were READ for PROPERTY/LOCK_DEVICE/SMART_DEVICE, NONE elsewhere"
        },
        "enableGroupRestrictions": true,
        "groupRestrictions": [{ "groupId": 22222, "groupName": "Dalton" }],
        "rfidConfig": { "...": "elided" },
        "lyazonRfidConfig": { "...": "elided" },
        "remotelockRfidConfig": { "...": "elided" },
        "areSomeAccessCardsPendingCreation": false,
        "areSomeTaskCardsPendingCreation": false
      }
    ]
  }
}
```

### Delete a user — `removeSecondaryUser`

- `POST https://api.getlynx.co/ProdV1.1/secondaryUsers/removeSecondaryUser`
- Body: `{ "hostId": "<account id>", "loggedInUserId": "<account id>", "uniqueSecondaryUserId": 111111 }`
- Response echoes the id:

```json
{
  "status": true,
  "errorCodeId": 0,
  "errorMessage": "",
  "data": { "uniqueSecondaryUserId": 111111 }
}
```

- **Observed repeatedly**: on a successful delete the user disappears from the secondary-user
  list **immediately**, and the task code returns to the available pool **immediately**.
- ⚠️ **Suspected but unobservable**: removing the code from lock hardware takes longer
  (minutes-to-hours?), and there is **no signal to monitor** — no pending-style read exists for
  removal, so "did the lock actually forget the code" cannot be verified from the API.
  Unremoved codes remain the largest blast-radius item (finite lock memory), but convergence
  tracking is not a usable mitigation; **minimizing consumption/rotation is** (a reuse policy
  belongs to the extension's pool design). There is also an unconfirmed suspicion that code removals trigger
  manual checks by Lynx support staff — another reason to keep rotation rare.

An endpoint also exists to retrieve the groups assigned to a user — not yet captured; add here
if the reconciler ends up needing it.

### Unlock activity — `getActivities` (known, not captured)

`POST https://api.getlynx.co/ProdV1.1/logActivity/getActivities` returns a record of every
unlock event, including **which user unlocked**. Not yet captured or probed — relevant to the
stretch goal of monitoring emergency-code usage outside an expected window (extension
material), which would also be the only available signal that a "deleted"
code is still live on a lock.
