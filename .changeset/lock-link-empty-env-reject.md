---
'@twin-digital/lock-link': patch
---

Reject empty / whitespace-only strings on numeric env vars before coercion. `z.coerce.number()` on `""` yields `0`, which passed `.nonnegative()` on `GRACE_MINUTES` — a misconfigured deploy would have silently produced a 0-minute grace window. Applied uniformly to `ACCOUNT_ID`, `HORIZON_DAYS`, `SLA_HOURS`, and `GRACE_MINUTES`.
