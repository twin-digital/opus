# Vendor confirmation request: readiness-gated door-code messaging

Send to each candidate PMS (OwnerRez, Hostaway, Guesty, Cloudbeds) — core question plus the
matching vendor addendum. Answers close the final open item in
[pms-messaging-triggers.md](./pms-messaging-triggers.md).

## How to reach each vendor

No public pre-sales **email** addresses were found; three of the four route through a
sales/demo funnel, so these questions are most practically asked during a demo call (or in the
web contact/support form linked below), not sent cold by email.

| Vendor    | Channel                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| OwnerRez  | Self-serve — free trial + support tickets (no sales call): <https://www.ownerrez.com/pricing> |
| Hostaway  | Demo request (quote only after demo): <https://www.hostaway.com/pricing/>                     |
| Guesty    | Sales/demo form: <https://www.guesty.com/pricing/>                                            |
| Cloudbeds | Demo request: <https://www.cloudbeds.com>                                                     |

OwnerRez is the only one answerable without a sales call — its support tickets and forums take
product questions directly, so it can be confirmed fastest.

---

Subject: Pre-sales question — gating automated door-code messages on code readiness

We operate a small vacation-rental property whose smart locks are managed by third-party
middleware (Lynx Automation, getlynx.co), which writes each reservation's door code into a
custom field in the PMS. Door codes take anywhere from minutes to several hours to be
provisioned after a booking is created, and about 15% of our bookings are made on the day of
arrival. Before committing to a migration we need a precise answer to one question:

**Can an automated guest message be held until the door code actually exists — and what exactly
happens when it can't be?**

Specifically:

1. Can a scheduled/automated guest message be conditioned on a reservation field being
   non-empty — specifically a **custom field written by a third-party integration**, not your
   native lock feature's field?
2. If yes: when the condition is not met at the scheduled send time, is the message
   (a) held and re-evaluated until the field populates — for how long, and at what interval;
   (b) skipped permanently; or (c) sent with the field rendered blank?
3. If a hold window expires or a message is skipped, is any staff alert generated?
4. For a booking created _after_ the message's scheduled trigger time (a same-day booking),
   when does the message fire, and does the same conditioning apply?
5. Does your native smart-lock feature — or any lock-integration partner — trigger a guest
   message on the **code-creation event itself**, rather than on a clock?

A documented "yes, supported" (with links) is ideal; a clear "not supported" is equally useful.
We are finalizing a build-vs-buy decision this month.

---

## Per-vendor addenda

**OwnerRez** — your docs describe Scheduled Trigger "Retry" (hourly re-evaluation within a
window) and a "Door Code Status" condition (Code Not Generated / Failed / Generated
Successfully). (a) Does Door Code Status reflect only your native door-lock integrations, or
also a custom field written by Lynx (`{BXLYNXACCESSCODE}`)? (b) Is combining Retry + Door Code
Status on the guest arrival message a supported configuration for gating delivery? (c) When a
retry window expires with conditions unmet, the message is permanently dropped — is any alert
generated?

**Hostaway** — your docs describe a 15-minute delay when the standard `door_code` field is
empty, then fallback to the listing's static code. (a) Does any hold apply to reservation
**custom fields** (where Lynx writes)? (b) Your changelog describes automation conditions on
custom fields (`is empty` / `is not empty`) with re-checks on field change ("automations will
cancel/resume accordingly") — if a scheduled message is blocked by such a condition and the
field populates later, does the message then send (late), or is it cancelled? (c) Can the
static-code fallback be disabled (a static code is unusable for us — codes are per-reservation
and per-lock)?

**Guesty** — does any automation condition or hold exist on the key-code field being populated
before an auto-message containing `{{key_code}}` sends? What renders when `{{key_code}}` is
empty at send time?

**Cloudbeds** — same questions for the `LYNX_ACCESS_CODE` custom field in scheduled
correspondence: can a send be conditioned on it being non-empty, what renders when it is empty,
and is there any hold/re-evaluation mechanism?
