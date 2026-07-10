# Lodgify API — integration reference

The Lodgify (short-term-rental PMS / channel manager, internally "Hotel") side of lock-link.
This is the **how** — every endpoint, wire shape, and quirk we depend on. For what the system
does with these calls and when, see [architecture-sure-lock.md](./architecture-sure-lock.md).

## Provenance

Lodgify has an **official public API**: v2 for bookings/keyCodes/threads, plus the **legacy v1
messaging namespace** for outbound messages (v2 has no send endpoint). The v2 OpenAPI spec is
vendored at `src/lodgify/lodgify.openapi.json` and refreshed with the `pull-spec` tool; the v1
messaging endpoint is **not** in that spec — its schemas are hand-modeled from Lodgify's API
docs and verified by live probing (2026-07-07, against a Declined test booking where the guest
is our own account).

A throwaway `lodgify-messaging-probe.mjs` script (subcommands `booking`/`thread`/`send`/
`keycode`) exists in the repo root of the exploration checkout — it proves the messaging
contract by hand: thread read-back, `message_id` idempotency, `send_notification` behavior,
`key_code` round-trip.

## Auth

**`X-ApiKey: <key>`** header (Lodgify dashboard → Settings → Public API). Not a bearer token.
The same key works for both API versions.

## List bookings — `GET /v2/reservations/bookings`

- Query: `stayFilter=Upcoming` (or `ArrivalDate`/`DepartureDate` + `stayFilterDate` for a horizon
  window), `page`/`size`, `includeCount`, `updatedSince` (incremental).
- Returns `BookingSetDto { count, items: BookingDto[] }`. Each booking carries `id`,
  `property_id`, `arrival`/`departure`, `status` (Booked/Tentative/Declined), `is_deleted`,
  `source`, and **`rooms[].room_type_id` + `rooms[].key_code`** — so the list alone yields both
  the **gap signal** (empty `key_code`) and the `room_type_id` needed to write.

## Read a booking — `GET /v2/reservations/bookings/{id}`

- Returns `id`, `guest{name,email}`, `arrival`/`departure`, `property_id`,
  `rooms[{ room_type_id, key_code }]`, `source`, `source_text` (the real OTA reference, e.g.
  Expedia `2462813314`), `created_at`, and **`thread_uid`** (the messaging thread's UUID).
- ⚠️ `updated_at` does **not** change when key codes are written — never use it to detect changes.

## Write key codes — `PUT /v2/reservations/bookings/{id}/keyCodes`

- `{id}` = the numeric booking number from the confirmationCode join
  (see [lynx-api.md](./lynx-api.md)), int32.
- Body: `{ "rooms": [ { "room_type_id": <int>, "key_code": "<string>" } ] }`. `key_code` is a
  free-form string; round-trip fidelity (length, `·`, spaces) proven live 2026-07-07. Lodgify's
  UI does not surface the field anywhere and no active message template interpolates it.
- Returns **200** with a rooms-only echo (`BookingKeyCodeDto = { rooms: [{ room_type_id,
key_code }] }`, per the vendored OpenAPI) — **not** a full booking → read back
  `rooms[].key_code` to confirm the write (no separate GET needed).
- Errors: **404** booking/room not found (stale parsed id / `room_type_id`); **400** typed `code`
  (`ValidationError`/`ArgumentError`/…) + `message` + `correlation_id`; **401** bad key.
- One `key_code` per room; single-room bookings throughout this account. (Lynx's locks are
  physical hardware; Lodgify only cares about the booking's room(s).)

## Send a message — `POST /v1/reservation/booking/{id}/messages`

- Body: an **array** of `{ subject, message, type, send_notification, message_id }`.
- `type: "Owner"` = host→guest. Always use `Owner`: ⚠️ `type: "Comment"` posts return success but
  the message is silently dropped (never appears in the thread — proven live).
- `send_notification: true` is the delivery switch — without it the message only sits in the
  thread (no email; proven live). With it, Lodgify emails the guest; per the API docs, bookings
  from an external channel have the message pushed through that channel instead. ⚠️ **Channel
  push for OTA bookings is documented but not yet verified live** — verify on the first real OTA
  send (watch the message's `route` in the thread).
- `message_id` is an idempotency key the caller controls (UUID). The server **rejects a repeat**
  of an existing `message_id` — no duplicate message, no duplicate email (proven live).
- ⚠️ **The HTTP status lies.** A successful send returns `200` with a literal `null` body. A
  failed send — including a duplicate `message_id` — **also returns HTTP 200**, with an error
  envelope in the body: `{ success: false, type: "domain_exception", statusCode: "400", ... }`.
  The client must parse the body. The duplicate-rejection envelope is a generic commit error
  (`"Update errors on commit…"`), **not** a typed duplicate code — don't classify by message
  text; re-read the thread instead (if our `message_id` is present, the message exists and the
  error was the benign duplicate case).

## Read a thread — `GET /v2/messaging/{threadGuid}`

- `{threadGuid}` comes from the booking's `thread_uid`.
- Returns an **array** of thread objects, each with `thread_uid`, `guest_name`/`guest_email`,
  `is_closed` (+ `error_title`/`error_message` when closed — the thread can no longer receive
  messages), and `messages[]`.
- Each message carries `id`, `subject`, `message` (may be HTML), `type` (Owner/Renter),
  `date_created`, `message_status`, `route`, `is_read`, attachments, and — crucially — the
  **`message_id`** supplied at send time, enabling exact-match sent-checks.
- `message_status` ∈ Submitted/Sent/Delivered/Failed. Observed: a notified message reached
  `Delivered` within seconds (email); a non-notified Owner message sits at `Unknown` — only
  notified messages are expected to progress.
- `route` enum: `Email`/`Airbnb`/`BookingCom`/`Vrbo`/`Sms`. Observed `null` for email-delivered
  messages on a Manual booking; OTA bookings presumably populate it (unverified — see above).
