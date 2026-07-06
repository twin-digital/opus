---
'@twin-digital/lock-link': patch
---

Fix two bugs that silently dropped bookings from the sync's candidate list:

1. **Same-day arrivals were invisible.** The sync only queried Lodgify's `Upcoming` stayFilter, but Lodgify flips a booking from `Upcoming` to `Current` at its check-in time — so any booking arriving today, past its check-in time, was missing from the poll. `runSync` now queries both `Upcoming` and `Current` and dedupes by `id` (`Current` wins on collision, since its state is fresher).
2. **Only the first page was fetched.** `listBookings` sends `page` and `size` params but was called without either, so anything past page one (50 bookings under Lodgify's default) was silently dropped. Added `LodgifyClient.listAllBookings` that walks pages until a page comes back shorter than the requested `size` — the standard offset-pagination end signal. Immune to the null-`count` and mid-walk-mutation cases where a `count`-based terminator would silently drop bookings.

The Lodgify fake now models stayFilter partitioning (Set-valued so a booking can transiently appear in both buckets) + real pagination via `page` / `size` so regressions to either bug surface as test failures.
