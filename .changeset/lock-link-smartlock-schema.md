---
'@twin-digital/lock-link': patch
---

Type the Lynx smart-lock schema against the observed wire shape: `isJammed` is an int (`0`/`1`) and `provisionStatus` is a numeric status code. Add a shared `zBoolInt = z.union([z.literal(0), z.literal(1)])` and apply it to the three fields Lynx encodes as int-booleans — `smartLockSchema.isJammed`, `accessCodeSchema.isCodeSet`, `accessCodeSchema.isHubCommunicated`. Runtime type stays `0 | 1` so `if (lock.isJammed) …` reads naturally via JS truthy, and stray wire values (`2`, `"1"`, `null`) fail parse rather than silently propagating. None of these fields is consumed by the sync today (only `lockName` and the reservation's `syncToLockStatus` are); the doc, fake seed values, and `world` helpers are updated to match.
