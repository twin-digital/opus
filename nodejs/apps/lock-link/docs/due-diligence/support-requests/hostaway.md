# Gating automated door-code messages on code readiness [Critical Pre-migration Q]

Good afternoon,

We operate a small vacation-rental property whose smart locks are managed by third-party middleware (Lynx Automation, getlynx.co), which writes each reservation's door code into a custom field in the PMS. Door codes take anywhere from minutes to several hours to be provisioned after a booking is created, and about 15% of our bookings are made on the day of arrival. Before committing to a migration we need a precise answer to one question:

**Can an automated guest message be held until the door code actually exists — and what exactly happens when it can't be?**

Specifically:

1. Can a scheduled/automated guest message be conditioned on a reservation field being non-empty — specifically a **custom field written by a third-party integration**, not your native lock feature's field?
2. If yes: when the condition is not met at the scheduled send time, is the message
   (a) held and re-evaluated until the field populates — for how long, and at what interval;
   (b) skipped permanently; or
   (c) sent with the field rendered blank?
3. If a hold window expires or a message is skipped, is any staff alert generated?
4. For a booking created _after_ the message's scheduled trigger time (a same-day booking), when does the message fire, and does the same conditioning apply?
5. Does your native smart-lock feature — or any lock-integration partner — trigger a guest message on the **code-creation event itself**, rather than on a clock?

A documented "yes, supported" (with links) is ideal; a clear "not supported" is equally useful. We are finalizing a build-vs-buy decision this month.

Context:

Your docs describe a 15-minute delay when the standard `door_code` field is empty, then fallback to the listing's static code.

(a) Does any hold apply to reservation **custom fields** (where Lynx writes)?
(b) Your changelog describes automation conditions on custom fields (`is empty` / `is not empty`) with re-checks on field change ("automations will cancel/resume accordingly") — if a scheduled message is blocked by such a condition and the field populates later, does the message then send (late), or is it cancelled?
(c) Can the static-code fallback be disabled (a static code is unusable for us — codes are per-reservation and per-lock)?
