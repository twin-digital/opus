import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Fake } from '../testing/http.js'
import { startLodgifyFake } from '../testing/lodgify-fake.js'
import { createWorld, type World } from '../testing/world.js'
import { LodgifyApiError, LodgifyClient } from './client.js'

/** The Lodgify client driven against the stateful fake — the same seam the canary uses. */
describe('lodgify client', () => {
  let world: World
  let fake: Fake
  let client: LodgifyClient

  beforeEach(async () => {
    world = createWorld()
    world.addReservation({ bookingId: 20559349, roomTypeId: 501, code: '9234' })
    fake = await startLodgifyFake(world)
    client = new LodgifyClient({ baseUrl: fake.baseUrl, apiKey: world.lodgifyApiKey })
  })
  afterEach(async () => {
    await fake.close()
  })

  it('lists bookings, parsed through the schema', async () => {
    const set = await client.listBookings({ stayFilter: 'Upcoming' })
    expect(set.count).toBe(1)
    expect(set.items[0]?.id).toBe(20559349)
    expect(set.items[0]?.rooms?.[0]?.key_code).toBe('')
  })

  it('gets a booking by id', async () => {
    const booking = await client.getBooking(20559349)
    expect(booking.id).toBe(20559349)
    expect(booking.rooms?.[0]?.room_type_id).toBe(501)
  })

  it('writes key codes and reads the update back (stateful round-trip)', async () => {
    const updated = await client.putKeyCodes(20559349, [{ room_type_id: 501, key_code: '9234' }])
    expect(updated.rooms?.[0]?.key_code).toBe('9234')
    const reread = await client.getBooking(20559349)
    expect(reread.rooms?.[0]?.key_code).toBe('9234')
  })

  it('throws LodgifyApiError with the status on a 404', async () => {
    await expect(client.getBooking(99999999)).rejects.toBeInstanceOf(LodgifyApiError)
    await expect(client.getBooking(99999999)).rejects.toMatchObject({ status: 404 })
  })

  it('throws LodgifyApiError on a bad API key', async () => {
    const bad = new LodgifyClient({ baseUrl: fake.baseUrl, apiKey: 'wrong-key' })
    await expect(bad.listBookings()).rejects.toMatchObject({ status: 401 })
  })
})
