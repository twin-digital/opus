---
'@twin-digital/lock-link': patch
---

Add the gap-fill sync orchestration (`runSync`) and the escalation `Notifier` seam. Lodgify-driven: list Upcoming bookings, take the in-horizon `Booked` gaps (rooms missing a code), and only then read Lynx — index reservations by the `confirmationCode` join, push a code once every lock reports `success`, escalate a still-bare booking once it's within the SLA window of arrival and past the grace period, and otherwise skip (the schedule is the retry). Adds `created_at` to the Lodgify booking schema for the grace window.
