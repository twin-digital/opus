---
'@twin-digital/lock-link': patch
---

Address cold-review findings on the schema, contract test, and test fakes:

- `bookingSetSchema` accepts spec-nullable `count` / `items` (normalizes to 0 / []) — a documented null response would have crashed the poll driver otherwise.
- `bookingStatusSchema` truly tolerates unseen values via `.catch('Open')` so a new Lodgify status can't halt a whole batch.
- Contract test walks `BookingSetDto.count`/`.items` nullability, `guest.name`/`guest.email` nullability, and asserts the PUT keyCodes REQUEST body shape (previously only the response echo was checked).
- Test world: reject duplicate `bookingId` and conflicting per-property lock sets — silent divergence that no real system can produce.
- Lodgify fake PUT is atomic: resolve every target room before mutating, so a mid-batch 404 can't leave a half-applied write in the shared world.
- Lodgify fake test asserts the wrong-key case sends an actual wrong key (guards a regression to existence-only auth).
- Scenario test uses the real `resolveBookingId` join rule instead of a prefix match.
