---
'@twin-digital/lock-link': patch
---

Implement the Lynx→Lodgify door-code sync. The scheduled Lambda now runs the full gap-fill loop end to end: list Upcoming Lodgify bookings, skip Lynx entirely when there are no gaps, index Lynx reservations by the `confirmationCode` (`VK<accountId>`) join, `PUT keyCodes` when every lock reports `syncToLockStatus: success`, and escalate a still-bare booking once arrival is within the SLA window and the booking is past the grace period.

Operational config (Lynx account/user, horizon, SLA, grace, alert topic ARN, SSM parameter names) is validated at cold start via zod. The Lynx username/password and Lodgify API key are decrypted at runtime from SSM SecureString (Powertools `parameters`, cached across warm invocations). Escalations publish to an SNS topic (created here for now; the Lambda consumes it by ARN so it can later become a shared cross-workload topic without code changes). Any whole-run failure escalates before rethrowing so it never disappears into a Lambda error metric.
