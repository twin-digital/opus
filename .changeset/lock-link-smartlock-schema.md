---
'@twin-digital/lock-link': patch
---

Fix `smartLockSchema` — real Lynx returns `isJammed` and `provisionStatus` as numbers on the wire, not `boolean` / `string`. Manual invocation was throwing `ZodError` on every `getSmartLocksByPropertyWithStatus` response. Neither field is consumed by the sync logic today (only `lockName` is used, to build the per-property lock set as the readiness denominator), so this is a schema-vs-reality correction with no behavior change. Doc and fake seed values updated to match.
