---
'@twin-digital/lock-link': patch
---

Add CloudWatch alarms (fixes #217) covering both operational health and business behavior. All alarms publish to the existing `AlertTopic`, so operator email routing is already in place. `treatMissingData: NOT_BREACHING` keeps a quiet steady-state from paging.

**Health**

- `InvocationsBelowMinimum` — `Lambda.Invocations` sum < 22 in 24h (schedule stopped).
- `FunctionErrors` — `Lambda.Errors` sum ≥ 1 in 1h (any exception from the handler).

**Behavior**

- `ZeroCodesWritten24h` — `CodesWritten` sum == 0 in 24h (sync running but silent).
- `EscalationsInLastHour` — `Escalated` sum ≥ 1 in 1h (a code missed its SLA — mirrors the SNS notification for dashboarding).

**Nice-to-have**

- `GapsFoundSpike` — `GapsFound` sum > 50 in 1h (starting threshold; retune after ~1 week of real cadence).

Also pins `POWERTOOLS_METRICS_NAMESPACE=lock-link` on the Lambda so the sync's EMF metrics land under a named namespace the alarms reference — previously they defaulted to `Application`.
