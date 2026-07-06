import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LodgifyClient } from '../lodgify/client.js'
import { type Fake } from '../testing/http.js'
import { startLodgifyFake } from '../testing/lodgify-fake.js'
import { startLynxFake } from '../testing/lynx-fake.js'
import { createWorld, type World } from '../testing/world.js'
import { LynxClient } from '../lynx/client.js'
import { type NotifyEvent, type Notifier } from './notify.js'
import { mergeBookings, runSync, type SyncConfig } from './sync.js'
import { type Booking } from '../lodgify/schema.js'

const ARRIVAL = 1_781_557_200 // unix seconds; the seeded reservation's check-in
const ARRIVAL_MS = ARRIVAL * 1000
const HOURS = 3_600_000

const CONFIG: SyncConfig = { accountId: 222262, horizonDays: 365, slaHours: 48, graceMinutes: 30 }

describe('runSync (gap-fill orchestration)', () => {
  let world: World
  let lynx: Fake
  let lodgify: Fake
  let events: NotifyEvent[]
  let lynxClient: LynxClient
  let lodgifyClient: LodgifyClient
  const notify: Notifier = (event) => {
    events.push(event)
    return Promise.resolve()
  }

  const run = (now: number, config: Partial<SyncConfig> = {}) =>
    runSync({ lynx: lynxClient, lodgify: lodgifyClient, notify, config: { ...CONFIG, ...config }, now })

  beforeEach(async () => {
    world = createWorld()
    ;[lynx, lodgify] = await Promise.all([startLynxFake(world), startLodgifyFake(world)])
    events = []
    lynxClient = new LynxClient({
      baseUrl: lynx.baseUrl,
      username: world.credentials.username,
      password: world.credentials.password,
      userId: '232753',
    })
    lodgifyClient = new LodgifyClient({ baseUrl: lodgify.baseUrl, apiKey: world.lodgifyApiKey })
  })
  afterEach(async () => {
    await Promise.all([lynx.close(), lodgify.close()])
  })

  it('writes a ready code to Lodgify and converges on the next run', async () => {
    world.addReservation({ bookingId: 20559349, roomTypeId: 501, code: '9234' })

    const first = await run(ARRIVAL_MS - 72 * HOURS)
    expect(first).toMatchObject({ gaps: 1, written: 1, escalated: 0 })
    expect(events).toEqual([])
    expect(world.bookings.get(20559349)?.rooms?.[0]?.key_code).toBe('9234')
    // Per-outcome detail — one written entry with the code + room + confirmation code.
    expect(first.outcomes).toEqual([
      {
        bookingId: 20559349,
        action: 'written',
        code: '9234',
        roomTypeIds: [501],
        confirmationCode: '20559349VK222262',
      },
    ])

    // Second pass: no gap left, so Lynx is never touched — but the snapshot still
    // categorizes the (now-filled) booking. Pinning `snapshot` on the healthy no-gap
    // path guards the "trace any bookingId" contract on the most-frequent runtime path.
    const lynxCallsBefore = world.lynxRequests.length
    const second = await run(ARRIVAL_MS - 71 * HOURS)
    expect(second).toMatchObject({ gaps: 0, written: 0, outcomes: [] })
    expect(second.snapshot).toEqual([
      { bookingId: 20559349, arrival: expect.any(String), category: 'code-set', status: 'Booked' },
    ])
    expect(world.lynxRequests.length).toBe(lynxCallsBefore)
  })

  it('escalates a not-ready code once inside the SLA window', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234', synced: false }) // scheduled, not live

    const result = await run(ARRIVAL_MS - 24 * HOURS) // within 48h SLA, booking is 7d old (> grace)
    expect(result).toMatchObject({ written: 0, escalated: 1 })
    expect(world.bookings.get(20559349)?.rooms?.[0]?.key_code).toBe('')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ severity: 'warning', bookingId: 20559349 })
    expect(events[0]?.details?.some((d) => d.includes('scheduled'))).toBe(true)
    // Outcome carries the reasons so a human reading logs can see WHY it escalated.
    // Includes confirmationCode — the distinguishing field from the no-Lynx-entry branch
    // (which has no reservation to source it from).
    expect(result.outcomes[0]).toMatchObject({
      bookingId: 20559349,
      action: 'escalated',
      confirmationCode: '20559349VK222262',
    })
    expect(result.outcomes[0]?.reasons?.some((r) => r.includes('scheduled'))).toBe(true)
  })

  it('skips a not-ready code that is still outside the SLA window', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234', synced: false })

    const result = await run(ARRIVAL_MS - 100 * HOURS) // > 48h to arrival
    expect(result).toMatchObject({ written: 0, escalated: 0, skipped: 1 })
    expect(events).toEqual([])
    expect(result.outcomes[0]).toMatchObject({
      bookingId: 20559349,
      action: 'skipped',
      confirmationCode: '20559349VK222262',
    })
    expect(result.outcomes[0]?.reasons?.some((r) => r.includes('scheduled'))).toBe(true)
  })

  it('skips a no-Lynx-entry gap outside the SLA window (not-overdue no-entry branch)', async () => {
    // A Lodgify booking with no matching Lynx reservation. Well outside the SLA window,
    // so isOverdue is false → skipped, not escalated. Guards against an inverted-guard
    // regression that would silently escalate every no-entry gap on every tick.
    world.addReservation({ bookingId: 20559349, code: '9234' })
    world.reservations.length = 0 // drop the Lynx side; keep the Lodgify booking

    const result = await run(ARRIVAL_MS - 200 * HOURS) // far outside SLA
    expect(result).toMatchObject({ written: 0, escalated: 0, skipped: 1 })
    expect(events).toEqual([])
    expect(result.outcomes[0]).toMatchObject({
      bookingId: 20559349,
      action: 'skipped',
      reasons: ['no Lynx reservation for booking'],
    })
    expect(result.outcomes[0]?.confirmationCode).toBeUndefined()
  })

  it('suppresses escalation for a brand-new booking inside the grace period', async () => {
    const now = ARRIVAL_MS - 24 * HOURS // within SLA
    world.addReservation({ bookingId: 20559349, code: '9234', synced: false, createdAtTimestamp: now / 1000 - 60 }) // 1 min old

    const result = await run(now)
    expect(result).toMatchObject({ escalated: 0, skipped: 1 })
    expect(events).toEqual([])
  })

  it('never calls Lynx when there are no gaps', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234', lodgifyKeyCode: '9234' }) // already has a code

    const result = await run(ARRIVAL_MS - 24 * HOURS)
    expect(result).toMatchObject({ gaps: 0 })
    // Snapshot is preserved on the no-gap early-return path — losing it here would
    // strip the trace for the most-frequent runtime path.
    expect(result.snapshot).toHaveLength(1)
    expect(result.snapshot[0]).toMatchObject({ bookingId: 20559349, category: 'code-set' })
    expect(world.lynxRequests).toEqual([])
  })

  it('escalates a confirmationCode that does not match the configured account', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234' })

    // Far from arrival so the gap itself is skipped — isolating the join-integrity escalation.
    await run(ARRIVAL_MS - 1000 * HOURS, { accountId: 999999 })
    expect(events.some((e) => e.reason.includes('did not parse'))).toBe(true)
  })

  it('escalates a Lodgify booking with an unparseable arrival on the no-Lynx-entry path', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234' })
    // Drop the Lynx side (so `byBookingId.get(gap.id)` misses) and corrupt the Lodgify
    // arrival. Pre-fix, `isOverdue(NaN, …)` returned false → perpetual skip; now it
    // treats NaN as overdue and escalates.
    world.reservations.length = 0
    const booking = world.bookings.get(20559349)
    if (booking) {
      Object.assign(booking, { arrival: 'not-a-date' })
    }

    const result = await run(ARRIVAL_MS - 100 * HOURS)
    expect(result).toMatchObject({ escalated: 1, skipped: 0 })
    expect(events.some((e) => e.reason.includes('no Lynx reservation'))).toBe(true)
    // Pin the outcome shape for this branch — a regression that flipped action to
    // 'skipped' while still firing notify would otherwise still pass the count check.
    expect(result.outcomes[0]).toMatchObject({
      bookingId: 20559349,
      action: 'escalated',
      reasons: ['no Lynx reservation for booking'],
    })
    expect(result.outcomes[0]?.confirmationCode).toBeUndefined()
  })

  it('escalates when the same bookingId resolves under two different properties', async () => {
    world.addReservation({ bookingId: 20559349, propertyId: 72230, code: '9234', synced: false })
    // A second Lynx reservation with the SAME confirmationCode on a DIFFERENT propertyId.
    // Only Lynx state (not Lodgify) matters, so tack it onto the world's reservations directly.
    const first = world.reservations[0].reservation
    world.addProperty({ propertyId: 72231, name: 'Second' })
    world.reservations.push({
      propertyId: 72231,
      type: 'upcoming',
      reservation: { ...first, bookingId: first.bookingId + 1 },
    })

    await run(ARRIVAL_MS - 100 * HOURS)
    expect(events.some((e) => e.reason.includes('multiple properties'))).toBe(true)
  })

  it('snapshot categorizes every Lodgify booking the sync sees', async () => {
    // One booking per category the fake surfaces. `deleted` is defensive on the sync
    // side but unreachable through Lodgify's Upcoming filter — the fake mirrors that
    // by excluding is_deleted at the list endpoint, so no assertion for it here.
    world.addReservation({ bookingId: 1, code: '9234' }) // gap: Booked, in-horizon, missing code
    world.addReservation({ bookingId: 2, code: '9234', lodgifyKeyCode: '9234' }) // code-set: filled
    world.addReservation({ bookingId: 3, code: '9234', checkInTimestamp: ARRIVAL + 30 * 86400 }) // 30d out
    world.addReservation({ bookingId: 4, code: '9234', status: 'Tentative' }) // not-booked
    // rooms.nullable() is in the Lodgify wire schema. A null-rooms booking has nothing
    // to fill, so it categorizes as code-set. Pinning this so a refactor that drops the
    // `?? []` guard NPEs a test instead of production.
    world.addReservation({ bookingId: 5, code: '9234' })
    const nullRooms = world.bookings.get(5)
    if (nullRooms) {
      Object.assign(nullRooms, { rooms: null })
    }

    // Override horizonDays down from the suite default (365d) so the 30d-out booking
    // actually falls out of horizon.
    const result = await run(ARRIVAL_MS - 100 * HOURS, { horizonDays: 14 })

    const byId = new Map(result.snapshot.map((s) => [s.bookingId, s]))
    expect(byId.get(1)?.category).toBe('gap')
    expect(byId.get(2)?.category).toBe('code-set')
    expect(byId.get(3)?.category).toBe('out-of-horizon')
    expect(byId.get(4)?.category).toBe('not-booked')
    expect(byId.get(5)?.category).toBe('code-set')
    // Snapshot is the full Lodgify list, not just gaps — the "here's what the sync saw"
    // trace that pairs with `outcomes` for full per-booking observability.
    expect(result.snapshot).toHaveLength(5)
  })

  it('includes same-day arrivals whose Lodgify state has flipped to Current', async () => {
    // The bug this pins: same-day arrivals past their check-in time move from
    // `Upcoming` to `Current`. A sync that only queries `Upcoming` misses them — the
    // exact moment a guest most needs the code.
    world.addReservation({ bookingId: 1, code: '9234', stayCategory: 'Upcoming' })
    world.addReservation({ bookingId: 2, code: '9234', stayCategory: 'Current' })

    const result = await run(ARRIVAL_MS - 24 * HOURS)

    // Sync must issue BOTH stayFilter queries — the whole point of the fix. Exact
    // page counts pin the terminator too: two bookings well under `size=50`, one
    // page per filter, no retries.
    expect(listingCallsByFilter()).toEqual({ upcoming: [1], current: [1] })
    // Both bookings surface in the snapshot; a Current-only booking is no longer invisible.
    const byId = new Map(result.snapshot.map((s) => [s.bookingId, s]))
    expect(byId.get(1)?.category).toBe('gap')
    expect(byId.get(2)?.category).toBe('gap')
    expect(result.snapshot).toHaveLength(2)
  })

  const listingCallsByFilter = () => {
    const upcoming: number[] = []
    const current: number[] = []
    for (const r of world.lodgifyRequests) {
      if (r.path !== '/v2/reservations/bookings' || r.method !== 'GET') {
        continue
      }
      const filter = r.query?.get('stayFilter')
      const page = Number(r.query?.get('page') ?? '1')
      if (filter === 'Upcoming') {
        upcoming.push(page)
      }
      if (filter === 'Current') {
        current.push(page)
      }
    }
    return { upcoming, current }
  }

  it('paginates until a short page — 75 bookings → 2 Upcoming pages + 1 empty Current page', async () => {
    // Seed more bookings than fit in one page (fake default = size 50) so a
    // single-page fetch would leave 25 behind.
    for (let i = 1; i <= 75; i += 1) {
      world.addReservation({ bookingId: i, code: '9234', propertyId: 72230 + (i % 4) })
    }

    const result = await run(ARRIVAL_MS - 24 * HOURS)

    // All 75 surface in the snapshot — pagination walked every page.
    expect(result.snapshot).toHaveLength(75)
    // Exact call counts — pins BOTH termination branches. Upcoming: page 1 returns 50
    // (== size, keep going), page 2 returns 25 (< size, stop). Current: page 1 returns
    // 0 (< size, stop). No stray page 3 (overfetch regression would fail).
    expect(listingCallsByFilter()).toEqual({ upcoming: [1, 2], current: [1] })
  })

  it('mergeBookings: Current wins on same-id collision (fresher state)', () => {
    // Direct test of the dedup contract. Feed two Booking objects with the SAME id but
    // materially different `status` values, and assert the surviving Booking is the
    // Current-side variant. A regression that inverted merge order — the exact bug the
    // contract prevents — would flip the surviving status.
    const base: Omit<Booking, 'status'> = {
      id: 1,
      property_id: 72230,
      arrival: '2026-06-15T21:00:00Z',
      departure: '2026-06-16T16:00:00Z',
      is_deleted: false,
      source: 'Expedia',
      source_text: null,
      created_at: '2026-06-01T00:00:00Z',
      guest: { name: 'Guest', email: 'g@example.com' },
      rooms: [{ room_type_id: 501, key_code: '' }],
    }
    const upcoming: Booking = { ...base, status: 'Tentative' } // stale
    const current: Booking = { ...base, status: 'Booked' } // fresher

    const merged = mergeBookings([upcoming], [current])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.status).toBe('Booked') // Current-variant survived
  })

  it('mergeBookings: preserves ordering and does not clone', () => {
    // Non-collision case — every input survives, order = upcoming then non-collided current.
    const a: Booking = { id: 1 } as Booking
    const b: Booking = { id: 2 } as Booking
    const c: Booking = { id: 3 } as Booking
    const merged = mergeBookings([a, b], [c])
    expect(merged).toEqual([a, b, c])
    // Reference preserved — merge doesn't clone Booking objects.
    expect(merged[0]).toBe(a)
    expect(merged[2]).toBe(c)
  })

  it('walks one extra page at the exact size boundary — 50 bookings → 2 Upcoming pages', async () => {
    // Boundary case: a page returns exactly `size` items, so we can't tell from the
    // response alone whether there's a page 2 or not. Under a short-page terminator we
    // must fetch page 2 (empty) to be sure. A count-based terminator would exit after
    // page 1 but would then be vulnerable to null-count / stale-count / mid-walk
    // shrinkage bugs — the accepted trade-off is one extra empty fetch at each boundary.
    for (let i = 1; i <= 50; i += 1) {
      world.addReservation({ bookingId: i, code: '9234', propertyId: 72230 + (i % 4) })
    }

    const result = await run(ARRIVAL_MS - 24 * HOURS)

    expect(result.snapshot).toHaveLength(50)
    expect(listingCallsByFilter()).toEqual({ upcoming: [1, 2], current: [1] })
  })
})
