# Gating automated door-code messages on code readiness [Critical Pre-migration Q]

We operate a small vacation-rental property whose smart locks are managed by third-party middleware (Lynx Automation, getlynx.co), which writes each reservation's door code into a custom field in the PMS. Door codes take anywhere from minutes to several hours to be provisioned after a booking is created, and about 15% of our bookings are made on the day of arrival. Before committing to a migration we need a precise answer to one question:

**Can an automated guest message be held until the door code actually exists — and what exactly happens when it can't be?**

Specifically:

1. Can a scheduled/automated guest message be conditioned on a reservation field being non-empty — specifically a **custom field written by a third-party integration**, not your native lock feature's field?
2. If yes: when the condition is not met at the scheduled send time, is the message
   (a) held and re-evaluated until the field populates — for how long, and at what interval;
   (b) skipped permanently; or 
   (c) sent with the field rendered blank?
3. If a hold window expires or a message is skipped, is any staff alert generated?
4. For a booking created _after_ the message's scheduled trigger time (a same-day booking), when does the message fire, and does the same conditioning apply?
5. Does your native smart-lock feature — or any lock-integration partner — trigger a guest message on the **code-creation event itself**, rather than on a clock?

A documented "yes, supported" (with links) is ideal; a clear "not supported" is equally useful. We are finalizing a build-vs-buy decision this month.

Context:

Your docs describe Scheduled Trigger "Retry" (hourly re-evaluation within a window) and a "Door Code Status" condition (Code Not Generated / Failed / Generated Successfully). 

(a) Does Door Code Status reflect only your native door-lock integrations, or also a custom field written by Lynx (`{BXLYNXACCESSCODE}`)? 

(b) Is combining Retry + Door Code Status on the guest arrival message a supported configuration for gating delivery? 

(c) When a retry window expires with conditions unmet, the message is permanently dropped — is any alert generated?
