---
'@twin-digital/lock-link': patch
---

Address the second-pass cold review of PR #195:

- **CDK KMS grant**: replaced the alias-ARN `kms:Decrypt` resource (IAM never resolves aliases for KMS actions → `AccessDenied` on every SecureString read) with `*` scoped by a `kms:ViaService = ssm.<region>.amazonaws.com` condition. The AlertTopic is now server-side encrypted (`alias/aws/sns`), with a matching `kms:ViaService`-scoped `kms:GenerateDataKey` on the Lambda role.
- **Handler**: builds the Notifier before other work, fails fast on an unparseable `event.time`, and wraps `loadSecrets` / `runSync` in a best-effort try/notify/rethrow so a whole-run failure escalates instead of vanishing into a Lambda error metric.
- **checkReadiness**: rejects an empty-string access code (writing `''` to Lodgify would re-appear as a gap every tick — infinite churn with no convergence and no escalation).
- **runSync**: treats an unparseable Lodgify `arrival` as overdue (was silently skipped forever); escalates when the same bookingId resolves under two different properties (was last-write-wins with no signal).
- **Contract test**: `bookingStatusSchema` uses `.catch('Open')`, so the "accepts every documented status" test now compares the parsed value to the input — the previous `.success` check would silently pass a new spec value coerced to `'Open'`.
- **Config**: tightens the alert-topic ARN regex from `/^arn:aws:sns:/` to the full `arn:aws:sns:<region>:<12-digit-acct>:<name>` shape.
- **Secrets**: raises the Powertools TTL from 15 min to 2 h so warm containers actually reuse the cached value across the hourly schedule (the previous comment claimed this but the value was shorter than the cadence).

Two low-severity findings are deferred to follow-up issues: per-property Lynx-error isolation (#201) and the hardcoded personal alert email (#202).
