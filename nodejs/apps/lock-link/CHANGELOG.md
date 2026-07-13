# @twin-digital/lock-link

## 0.1.1

### Patch Changes

- 8b9156e: Add CloudWatch alarms (fixes #217) covering both operational health and business behavior. All alarms publish to the existing `AlertTopic`, so operator email routing is already in place. `treatMissingData: NOT_BREACHING` keeps a quiet steady-state from paging.

  **Health**

  - `InvocationsBelowMinimum` — `Lambda.Invocations` sum < 22 in 24h (schedule stopped).
  - `FunctionErrors` — `Lambda.Errors` sum ≥ 1 in 1h (any exception from the handler).

  **Behavior**

  - `ZeroCodesWritten7d` — `CodesWritten` sum == 0 across 7 consecutive daily periods (sync running but silent for a full week). A single quiet day is legitimate.
  - `EscalationsInLastHour` — `Escalated` sum ≥ 1 in 1h (a code missed its SLA — mirrors the SNS notification for dashboarding).

  **Nice-to-have**

  - `GapsFoundSpike` — `GapsFound` sum > 25 in 1h (starting threshold; retune after ~1 week of real cadence).

  Also pins `POWERTOOLS_METRICS_NAMESPACE=lock-link` on the Lambda so the sync's EMF metrics land under a named namespace the alarms reference — previously they defaulted to `Application`.

- f4c8648: Drop unused fields from `smartLockSchema` and `accessCodeSchema` so wire drift on fields the sync doesn't read can't crash the run.

  `smartLockSchema` now models only `lockName` (the field `checkReadiness` uses to enumerate the property's lock set). `accessCodeSchema` keeps `lockName`, `code`, `syncToLockStatus`, `syncToCloudStatus` (all consumed by readiness). Lynx also emits `connectivityStatus` / `batteryLevel` / `isJammed` / `provisionStatus` / `lockModelUniqueName` on smart locks and `isCodeSet` / `isHubCommunicated` on access codes; those wire types have drifted repeatedly (`isJammed` swung boolean → int → other; `batteryLevel` swung number → string), each drift blocking the sync on a validation error for data the code never looks at.

  Zod's default `.strip()` silently drops the unmodeled fields on parse, so the sync is immune to further drift on them. When a consumer for any of these fields lands (health context for escalation messages was the original intent), add them back typed against observed wire data at that point.

- 54bc405: Persist the Lynx JWT across Lambda cold starts in an SSM SecureString parameter. On the hourly schedule the container often goes cold between ticks — previously every cold start called `login`; now the first-ever run mints and writes back, and subsequent cold starts read the cached JWT and skip login (the JWT is valid ~95 days). CDK grants the Lambda `ssm:GetParameter` + `ssm:PutParameter` on the new `/lock-link/lynx-token` param plus `kms:GenerateDataKey` (via-service scoped to SSM) for SecureString writes. No out-of-band setup — the parameter is created on first `PutParameter` call.
- 92a65a9: Implement the Lynx→Lodgify door-code sync. The scheduled Lambda now runs the full gap-fill loop end to end: list Upcoming Lodgify bookings, skip Lynx entirely when there are no gaps, index Lynx reservations by the `confirmationCode` (`VK<accountId>`) join, `PUT keyCodes` when every lock reports `syncToLockStatus: success`, and escalate a still-bare booking once arrival is within the SLA window and the booking is past the grace period.

  Operational config (Lynx account/user, horizon, SLA, grace, alert topic ARN, SSM parameter names) is validated at cold start via zod. The Lynx username/password and Lodgify API key are decrypted at runtime from SSM SecureString (Powertools `parameters`, cached across warm invocations). Escalations publish to an SNS topic (created here for now; the Lambda consumes it by ARN so it can later become a shared cross-workload topic without code changes). Any whole-run failure escalates before rethrowing so it never disappears into a Lambda error metric.

- d5e6035: Fix two bugs that silently dropped bookings from the sync's candidate list:

  1. **Same-day arrivals were invisible.** The sync only queried Lodgify's `Upcoming` stayFilter, but Lodgify flips a booking from `Upcoming` to `Current` at its check-in time — so any booking arriving today, past its check-in time, was missing from the poll. `runSync` now queries both `Upcoming` and `Current` and dedupes by `id` (`Current` wins on collision, since its state is fresher).
  2. **Only the first page was fetched.** `listBookings` sends `page` and `size` params but was called without either, so anything past page one (50 bookings under Lodgify's default) was silently dropped. Added `LodgifyClient.listAllBookings` that walks pages until a page comes back shorter than the requested `size` — the standard offset-pagination end signal. Immune to the null-`count` and mid-walk-mutation cases where a `count`-based terminator would silently drop bookings.

  The Lodgify fake now models stayFilter partitioning (Set-valued so a booking can transiently appear in both buckets) + real pagination via `page` / `size` so regressions to either bug surface as test failures.

- f245a3b: Fix Lynx login: the wire field is `email`, not `username`. The client was sending `{ username, password }` which Lynx rejected with `400 Bad request`, meaning every scheduled tick failed at the first `login` call. Also: when login fails, include the response body in the thrown `LynxApiError` so a future misconfiguration doesn't hide behind a generic message. The fake now models Lynx's `400` on a missing `email` field so this class of bug can't slip past tests again.
- f31423c: Enrich the sync's observability so a CloudWatch reader can answer "which bookings got codes, why did the rest not?" and dashboard the pipeline health:

  - **Per-booking snapshot logging**: `runSync` returns a `readonly snapshot[]` categorizing every Lodgify booking it considered (`gap` / `code-set` / `out-of-horizon` / `not-booked` / `deleted`). The handler emits one structured log line per booking. Answers "why didn't booking X get a code?" without needing to reproduce a run: filter on `bookingId` to see both the `considered` line and any matching outcome.
  - **Per-outcome logging**: `runSync` also returns a `readonly outcomes[]` for the gap subset — action (`written` / `skipped` / `escalated`), `bookingId`, `confirmationCode`, `roomTypeIds` for writes, `codeMasked` (`**` + last two digits) for writes, and readiness `reasons` for skips/escalations. Queryable in CloudWatch Logs Insights (`filter action = "written"`). Full door PINs aren't logged — the masked suffix lets an operator match a write against the value in Lodgify without exposing enough for a log-reader to enter the lock.
  - **CloudWatch metrics**: emits `GapsFound`, `CodesWritten`, `Escalated`, `Skipped` counters via Powertools `metrics.addMetric`, providing dashboard/alarm surface (`sum(CodesWritten) > 0` for health, `Escalated > 0` for pager). Also silences the "No application metrics to publish" warning at flush time.
  - **X-Ray active tracing**: enabled on the Lambda so Powertools' `ColdStart` and subsegment annotations land in X-Ray; also silences the "cannot annotate the main segment" warning.

- 4787d3a: Type the Lynx smart-lock schema against the observed wire shape: `isJammed` is an int (`0`/`1`) and `provisionStatus` is a numeric status code. Add a shared `zBoolInt = z.union([z.literal(0), z.literal(1)])` and apply it to the three fields Lynx encodes as int-booleans — `smartLockSchema.isJammed`, `accessCodeSchema.isCodeSet`, `accessCodeSchema.isHubCommunicated`. Runtime type stays `0 | 1` so `if (lock.isJammed) …` reads naturally via JS truthy, and stray wire values (`2`, `"1"`, `null`) fail parse rather than silently propagating. None of these fields is consumed by the sync today (only `lockName` and the reservation's `syncToLockStatus` are); the doc, fake seed values, and `world` helpers are updated to match.
- Updated dependencies [5a835b6]
  - @twin-digital/observability-lib@0.0.5

## 0.1.0

### Minor Changes

- d3f7b5f: Add the `lock-link` app: a scheduled Lambda scaffold (logs on each run via observability-lib) and its self-contained AWS CDK stack (NodejsFunction + hourly EventBridge schedule), split into `infra/` and `src/` source roots.

### Patch Changes

- 53bbd8a: Add the Lynx and Lodgify API clients plus the sync's pure join/readiness helpers. Both clients are base-URL-injectable and parse every response through the zod schema — Lodgify uses `X-ApiKey`; Lynx logs in for an `x-auth-token` JWT, caches it, and re-mints on a 401, paginating under the hood. `resolveBookingId` extracts the Lodgify booking id from a Lynx `confirmationCode` (escalates on a `VK<accountId>` suffix mismatch); `checkReadiness` decides whether a reservation's access codes are safe to push (every lock covered, all `syncToLockStatus: success`, one code).
- 0ef40ff: Add an integration-test harness for the Lynx→Lodgify sync: stateful in-memory fakes for both APIs over one shared seed world, zod response schemas as the contract shared by the runtime client, the fakes, and the canary, and an offline contract test that pins the Lodgify schema to Lodgify's vendored OpenAPI (regenerated by `pull-spec.ts`, drift-checked nightly). The Lodgify schema models the API's nullable `rooms` and `room.key_code`.
- 348c15a: Split the deploy/destroy scripts into tool-typed turbo tasks (`deploy:serverless` / `deploy:cdk`) so CI can deploy each tool to its own account and role. Membership is implicit — `turbo run deploy:serverless` runs only packages defining it, `deploy:cdk` only CDK apps. No change to what is deployed.
- Updated dependencies [d3f7b5f]
  - @twin-digital/observability-lib@0.0.4
