---
'@twin-digital/lock-link': patch
---

Drop unused fields from `smartLockSchema` and `accessCodeSchema` so wire drift on fields the sync doesn't read can't crash the run.

`smartLockSchema` now models only `lockName` (the field `checkReadiness` uses to enumerate the property's lock set). `accessCodeSchema` keeps `lockName`, `code`, `syncToLockStatus`, `syncToCloudStatus` (all consumed by readiness). Lynx also emits `connectivityStatus` / `batteryLevel` / `isJammed` / `provisionStatus` / `lockModelUniqueName` on smart locks and `isCodeSet` / `isHubCommunicated` on access codes; those wire types have drifted repeatedly (`isJammed` swung boolean → int → other; `batteryLevel` swung number → string), each drift blocking the sync on a validation error for data the code never looks at.

Zod's default `.strip()` silently drops the unmodeled fields on parse, so the sync is immune to further drift on them. When a consumer for any of these fields lands (health context for escalation messages was the original intent), add them back typed against observed wire data at that point.
