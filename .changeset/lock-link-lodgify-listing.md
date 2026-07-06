---
'@twin-digital/lock-link': patch
---

Fix two bugs that silently dropped bookings from the sync's candidate list:

1. **Same-day arrivals were invisible.** The sync only queried Lodgify's `Upcoming` stayFilter, but Lodgify flips a booking from `Upcoming` to `Current` at its check-in time — so any booking arriving today, past its check-in time, was missing from the poll. `runSync` now queries both `Upcoming` and `Current` and dedupes by `id` (`Current` wins on collision, since its state is fresher).
2. **Only the first page was fetched.** `listBookings` sends `page` and `size` params but was called without either, so anything past page one (50 bookings under Lodgify's default) was silently dropped. Added `LodgifyClient.listAllBookings` that walks pages via `count` from the response envelope until every booking has been read; sync uses it.

The Lodgify fake now models both dimensions (stayFilter partitioning + real pagination via `page` / `size`) so a regression to either bug surfaces as a test failure.
