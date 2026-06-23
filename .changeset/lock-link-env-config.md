---
'@twin-digital/lock-link': patch
---

Source the sync's operational config from the environment via a validated `loadConfig` (`LockLinkConfig`: `accountId`, `userId`, `horizonDays`, `slaHours`, `graceMinutes`) — every value required and validated (coerced numbers, positive/ non-negative bounds), failing fast at cold start. The handler loads it; CDK sets the decided values on the Lambda (account 222262, user 232753, horizon 14d, SLA 48h, grace 30m). Secrets stay out of the environment (read from SSM SecureString at runtime).
