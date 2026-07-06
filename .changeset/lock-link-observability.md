---
'@twin-digital/lock-link': patch
---

Enrich the sync's observability so a CloudWatch reader can answer "which door codes went to which Lodgify bookings?" and dashboard the pipeline health:

- **Per-outcome logging**: `runSync` now returns a `readonly outcomes[]` alongside the run counts, and the handler emits one structured log line per gap — action (`written` / `skipped` / `escalated`), `bookingId`, `confirmationCode`, `roomTypeIds` for writes, and readiness `reasons` for skips/escalations. Queryable in CloudWatch Logs Insights (`filter action = "written"`). The literal door PIN (`outcome.code`) is deliberately NOT logged — it is a physical-access secret; verify the value by opening the booking in Lodgify.
- **CloudWatch metrics**: emits `GapsFound`, `CodesWritten`, `Escalated`, `Skipped` counters via Powertools `metrics.addMetric`, providing dashboard/alarm surface (`sum(CodesWritten) > 0` for health, `Escalated > 0` for pager). Also silences the "No application metrics to publish" warning at flush time.
- **X-Ray active tracing**: enabled on the Lambda so Powertools' `ColdStart` and subsegment annotations land in X-Ray; also silences the "cannot annotate the main segment" warning.
