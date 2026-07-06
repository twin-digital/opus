---
'@twin-digital/lock-link': patch
---

Enrich the sync's observability so a CloudWatch reader can answer "which bookings got codes, why did the rest not?" and dashboard the pipeline health:

- **Per-booking snapshot logging**: `runSync` returns a `readonly snapshot[]` categorizing every Lodgify booking it considered (`gap` / `code-set` / `out-of-horizon` / `not-booked` / `deleted`). The handler emits one structured log line per booking. Answers "why didn't booking X get a code?" without needing to reproduce a run: filter on `bookingId` to see both the `considered` line and any matching outcome.
- **Per-outcome logging**: `runSync` also returns a `readonly outcomes[]` for the gap subset — action (`written` / `skipped` / `escalated`), `bookingId`, `confirmationCode`, `roomTypeIds` for writes, `codeMasked` (`**` + last two digits) for writes, and readiness `reasons` for skips/escalations. Queryable in CloudWatch Logs Insights (`filter action = "written"`). Full door PINs aren't logged — the masked suffix lets an operator match a write against the value in Lodgify without exposing enough for a log-reader to enter the lock.
- **CloudWatch metrics**: emits `GapsFound`, `CodesWritten`, `Escalated`, `Skipped` counters via Powertools `metrics.addMetric`, providing dashboard/alarm surface (`sum(CodesWritten) > 0` for health, `Escalated > 0` for pager). Also silences the "No application metrics to publish" warning at flush time.
- **X-Ray active tracing**: enabled on the Lambda so Powertools' `ColdStart` and subsegment annotations land in X-Ray; also silences the "cannot annotate the main segment" warning.
