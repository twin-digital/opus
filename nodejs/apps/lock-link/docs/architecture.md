# lock-link — architecture overview

`@twin-digital/lock-link` exists so that every guest booked through **Lodgify** (the
short-term-rental PMS / channel manager) reliably has a working smart-lock door code in hand
when they arrive. The codes come from **Lynx**, the smart-lock management system that drives
the commercial (DormaKaba) locks: Lynx generates a per-reservation code, programs it into the
lock hardware, and emails/SMSes it to the guest. In practice that pipeline fails in ways that
are invisible until a guest is standing at the door — provisioning that outruns a same-day
booking, deliveries that never arrive (especially to OTA relay addresses), and no usable signal
from Lynx about any of it.

lock-link is one scheduled system with **two legs**, split by who it talks to:

## The monitoring leg (staff-facing)

Watches the pipeline end to end and talks only to the business. It captures each booking's
per-lock codes into the Lodgify booking record, measures how Lynx actually behaves —
provisioning latency, send outcomes, lock health, guest complaints, manual workarounds — as
durable, queryable evidence, and raises an alert when (and only when) a human needs to act, the
central case being a guest approaching arrival with no working code in hand. It sends nothing
to guests; until the delivery leg ships, the property manager acting on its alerts is the
delivery channel of last resort.

Full design: **[architecture-monitoring.md](./architecture-monitoring.md)**.

## The delivery leg (guest-facing)

Takes over guest communication so delivery stops depending on Lynx's unreliable sends: it
messages each guest their codes through Lodgify's messaging API (landing in the unified inbox
and riding the booking's channel), holds the message until provisioning has actually succeeded,
and — when provisioning fails outright against the deadline — issues a pre-provisioned
**fallback code** from a warm per-room pool so the guest is never left outside.

Full design: **[architecture-delivery.md](./architecture-delivery.md)**.

## Shared foundations

The legs are one deployment, not two systems: a single scheduled Lambda loop (AWS CDK,
EventBridge cron) that re-derives everything each tick from the two APIs and the clock.

- **Lodgify-driven, gap-fill**: the loop enumerates in-horizon Lodgify bookings and touches the
  unofficial Lynx API only where work remains, joined by the `confirmationCode` convention
  (`<lodgifyBookingId>VK<accountId>`).
- **Capture** is the shared spine: once Lynx reports every lock provisioned, the per-lock codes
  are written to the booking's `key_code` field — the stateless capture marker, the code source
  for alerts and guest messages alike, and the reference value for drift detection.
- **A common timing model** (env-tunable, no timing constants in code) with two leads shared by
  name and default: `LL_NORMAL_LEAD_HOURS` — the lead by which a code is normally in the
  guest's hands — and `LL_FALLBACK_LEAD_HOURS` — the last-resort deadline, past which the
  fallback acts (a person, until the delivery leg automates it).
- **Notifications split by audience**: business alerts (guest-impacting outcomes a manager can
  act on) and operational alerts (system causes for engineers), on two SNS topics.

## Document map

| Document                                                   | Contents                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| [architecture-monitoring.md](./architecture-monitoring.md) | The monitoring leg: capture, evidence store, metrics, alerting     |
| [architecture-delivery.md](./architecture-delivery.md)     | The delivery leg: guest messaging, fallback-code pool              |
| [lynx-api.md](./lynx-api.md)                               | Reverse-engineered Lynx dashboard API reference                    |
| [lodgify-api.md](./lodgify-api.md)                         | Official Lodgify API reference (v2 + legacy v1 messaging)          |
| [calibration-baseline.md](./calibration-baseline.md)       | Pre-launch timing seed data (provisioning latency, booking timing) |

## Sequencing

The monitoring leg ships first: it needs no guest-facing behavior to be valuable, its evidence
quantifies the problem the delivery leg exists to solve, and its calibration data prices the
delivery leg's timing knobs. The delivery leg then grows inside the same loop — the message
step attaches to the captured codes, and fallback issuance replaces the manager as what the
fallback deadline triggers.
