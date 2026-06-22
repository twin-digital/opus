import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bookingSetSchema } from '../lodgify/schema.js'
import { reservationsResponseSchema } from '../lynx/schema.js'
import { type Fake } from './http.js'
import { startLodgifyFake } from './lodgify-fake.js'
import { startLynxFake } from './lynx-fake.js'
import { createWorld, type World } from './world.js'

/**
 * Both fakes over one shared world. This is the dry-run of the actual gap-fill loop the
 * clients will drive later: Lodgify shows a gap, Lynx supplies the code under the joined
 * confirmationCode, the write lands in Lodgify, and a second pass finds nothing to do.
 */
describe('lynx + lodgify scenario', () => {
  let world: World
  let lynx: Fake
  let lodgify: Fake

  beforeEach(async () => {
    world = createWorld()
    // A near-term booking with no Lodgify code yet, but a fully-synced code in Lynx.
    world.addReservation({ bookingId: 20559349, propertyId: 72230, roomTypeId: 501, code: '9234' })
    ;[lynx, lodgify] = await Promise.all([startLynxFake(world), startLodgifyFake(world)])
  })
  afterEach(async () => {
    await Promise.all([lynx.close(), lodgify.close()])
  })

  const lodgifyGet = (path: string) =>
    fetch(`${lodgify.baseUrl}${path}`, { headers: { 'x-apikey': world.lodgifyApiKey } })

  it('fills a Lodgify gap from the code Lynx serves under the joined confirmationCode', async () => {
    // 1. Lodgify gap set: a Booked booking with an empty key_code.
    const bookings = bookingSetSchema.parse(await (await lodgifyGet('/v2/reservations/bookings')).json())
    const gap = bookings.items.find((b) => b.rooms.some((r) => r.key_code === ''))
    expect(gap?.id).toBe(20559349)

    // 2. Lynx code for that booking, found by the confirmationCode join.
    const reservations = reservationsResponseSchema.parse(
      await (
        await fetch(`${lynx.baseUrl}/ProdV1.1/dashboard/getReservationsByProperty`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${world.token}` },
          body: JSON.stringify({ propertyId: 72230, type: 'upcoming' }),
        })
      ).json(),
    )
    const match = reservations.data.reservations.find((r) => r.confirmationCode.startsWith(String(gap?.id)))
    const code = match?.accessCodes[0]?.code
    const ready = match?.accessCodes.every((c) => c.syncToLockStatus === 'success')
    expect(code).toBe('9234')
    expect(ready).toBe(true)

    // 3. Write it to Lodgify.
    const roomTypeId = gap?.rooms[0]?.room_type_id
    await fetch(`${lodgify.baseUrl}/v2/reservations/bookings/${String(gap?.id)}/keyCodes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-apikey': world.lodgifyApiKey },
      body: JSON.stringify({ rooms: [{ room_type_id: roomTypeId, key_code: code }] }),
    })

    // 4. Converged: a second pass sees no gaps.
    const after = bookingSetSchema.parse(await (await lodgifyGet('/v2/reservations/bookings')).json())
    expect(after.items.filter((b) => b.rooms.some((r) => r.key_code === ''))).toHaveLength(0)
  })
})
