---
'@twin-digital/lock-link': patch
---

Add the Lynx and Lodgify API clients plus the sync's pure join/readiness helpers. Both clients are base-URL-injectable and parse every response through the zod schema — Lodgify uses `X-ApiKey`; Lynx logs in for an `x-auth-token` JWT, caches it, and re-mints on a 401, paginating under the hood. `resolveBookingId` extracts the Lodgify booking id from a Lynx `confirmationCode` (escalates on a `VK<accountId>` suffix mismatch); `checkReadiness` decides whether a reservation's access codes are safe to push (every lock covered, all `syncToLockStatus: success`, one code).
