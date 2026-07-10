# Calibration baseline (2026-07-09)

Pre-launch seed data for the timing knobs in [architecture-sure-lock.md](./architecture-sure-lock.md#timing),
gathered before the messaging pivot ships. Two sources: mining the hourly-cadence sync logs for
observed Lynx provisioning latency (n=2 — the calibration metrics will supersede this), and the
Lodgify API for a 60-day booking-timing distribution (n=91). Recorded here because the logs age
out and the analysis is annoying to re-derive.

## Lynx provisioning latency (n=2, ±1 h resolution)

Method: per-outcome sync logs (hourly ticks) give each booking's first-seen-as-gap,
not-ready observations, and code-written times; Lodgify `created_at` anchors the clock-start.
Twelve other bookings were backfilled in a single sweep on 2026-07-07 (the first run after the
pagination fix) and tell us nothing about latency.

### Booking 21639618 — Expedia, booked at the door

- Created 2026-07-07 21:04 UTC — **~4 minutes after the 16:00 (Central) check-in time, on
  arrival day**. The standing-in-the-rain case, observed in the wild.
- Not ready at the 22:02, 23:02, and 00:04 ticks — with a **different lock lagging at different
  ticks** (`Lakeshore` `scheduled`, later `4th Street Lofts` `scheduled`): Lynx provisions locks
  one at a time, which validates the all-locks-`success` readiness bar.
- Code written 2026-07-08 01:02 UTC.
- **Provisioning latency: between 3 h 00 m and 3 h 58 m** for a same-day OTA booking. The guest
  was on site ~4 h before their code reached Lodgify.

### Booking 21664045 — Manual, booked 2 days ahead

- Created 2026-07-08 21:55 UTC; observed not-ready 7 minutes later (`Rex` `scheduled`); written
  at the next tick.
- **Provisioning latency: between 7 and 67 minutes.** Even the easy case is not instant.

## Booking-timing distribution (Lodgify, 60 days)

n = 91 Booked, non-deleted arrivals 2026-05-10 → 2026-07-09, all sources
(Expedia 39, direct/OH 28, Airbnb 12, Manual 8, Booking.com 4). `created_at` is UTC (verified
against sync-log first-sighting); check-in is 16:00 property-local. The Central/Eastern
assumption moves three borderline bookings across the check-in line:

| Category                            | Central (UTC-5) | Eastern (UTC-4) |
| ----------------------------------- | --------------- | --------------- |
| Advance (booked before arrival day) | 77              | 77              |
| Same-day, before check-in           | 11              | 8               |
| Same-day, at/after check-in         | 3               | 6               |

**Same-day bookings are ~15% of volume (~1.6/week).** Booked-after-check-in leads observed:
+0:04 (booking 21639618 above), +3:09, +16:53. Several before-check-in leads are under an hour
(0:02, 0:24, 0:52).

Lead time from booking to check-in (Central assumption):

| Booked within … of check-in | Bookings (of 91) |
| --------------------------- | ---------------- |
| already past check-in       | 3                |
| 1 h                         | 6                |
| 2 h                         | 7                |
| 4 h                         | 10               |
| 8 h (`SLA_HOURS`)           | 14               |
| 24 h (`SEND_HOURS`)         | 15               |
| 48 h                        | 24               |

## Implications for the defaults

- **All 14 same-day bookings fall inside the 8-hour SLA window** — the late-booking path is
  exercised ~1.6×/week, not an edge case. Lodgify's "X days before arrival" template model was
  structurally broken for all of them.
- **Emergency-code burn estimate: up to ~1 issuance/week.** 10 of 91 bookings arrived within
  4 h of check-in; if the ~3–4 h same-day provisioning latency (n=1) is typical, most of those
  guests hit T0 before Lynx is ready. Pool depth of 2–3 codes per room is adequate, but
  rotate-after-use will be a **weekly** habit, not a yearly one. If same-day provisioning turns
  out closer to the ~1 h easy case, burn drops toward the at-the-door bookings only
  (~0.35/week).
- The severity/grace tunables should be revisited against the calibration metrics once a few
  weeks of 10-minute-tick data exist — this baseline is the denominator to compare against.

## Caveats

- Provisioning latency is n=2 at ±1 h resolution; the same-day figure is n=1.
- One 60-day summer window — seasonality unknown.
- Timezone boundary affects only the before/after check-in split (3 bookings), not the same-day
  count or lead-time table.
