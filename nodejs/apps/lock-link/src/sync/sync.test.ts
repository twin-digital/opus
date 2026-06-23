import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LodgifyClient } from '../lodgify/client.js'
import { type Fake } from '../testing/http.js'
import { startLodgifyFake } from '../testing/lodgify-fake.js'
import { startLynxFake } from '../testing/lynx-fake.js'
import { createWorld, type World } from '../testing/world.js'
import { LynxClient } from '../lynx/client.js'
import { type NotifyEvent, type Notifier } from './notify.js'
import { runSync, type SyncConfig } from './sync.js'

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

    // Second pass: no gap left, so Lynx is never touched.
    const lynxCallsBefore = world.lynxRequests.length
    const second = await run(ARRIVAL_MS - 71 * HOURS)
    expect(second).toMatchObject({ gaps: 0, written: 0 })
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
  })

  it('skips a not-ready code that is still outside the SLA window', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234', synced: false })

    const result = await run(ARRIVAL_MS - 100 * HOURS) // > 48h to arrival
    expect(result).toMatchObject({ written: 0, escalated: 0, skipped: 1 })
    expect(events).toEqual([])
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
    expect(world.lynxRequests).toEqual([])
  })

  it('escalates a confirmationCode that does not match the configured account', async () => {
    world.addReservation({ bookingId: 20559349, code: '9234' })

    // Far from arrival so the gap itself is skipped — isolating the join-integrity escalation.
    await run(ARRIVAL_MS - 1000 * HOURS, { accountId: 999999 })
    expect(events.some((e) => e.reason.includes('did not parse'))).toBe(true)
  })
})
