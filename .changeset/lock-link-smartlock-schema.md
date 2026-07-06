---
'@twin-digital/lock-link': patch
---

Correct `smartLockSchema` and tighten Lynx's int-as-boolean fields:

- Real Lynx returns `isJammed` and `provisionStatus` as **numbers** on the wire, not `boolean` / `string`. Manual invoke was throwing `ZodError` on every `getSmartLocksByPropertyWithStatus` response before the sync could touch a booking.
- Added a strict-literal `zBoolInt = z.union([z.literal(0), z.literal(1)])` and applied it to the three "int-encoded boolean" fields in the Lynx schema: `isJammed` (smart lock), `isCodeSet` and `isHubCommunicated` (access code). Bad wire values (`2`, `"1"`, `null`) now fail parse instead of silently propagating; runtime type stays `0 | 1` so JS truthy eval reads naturally.

Neither `isJammed` nor `provisionStatus` is consumed by the sync logic — only `lockName` is used, to enumerate the property's lock set as the readiness denominator. This is a schema-vs-reality correction with no behavior change. Doc, fake seed values, and `world` helpers updated to match.
