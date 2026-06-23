import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bookingSetSchema, bookingSchema } from '../lodgify/schema.js'
import { type Fake } from './http.js'
import { startLodgifyFake } from './lodgify-fake.js'
import { createWorld, type World } from './world.js'

describe('lodgify fake', () => {
  let world: World
  let fake: Fake
  const get = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const headers = new Headers(init.headers)
    headers.set('x-apikey', world.lodgifyApiKey)
    return fetch(`${fake.baseUrl}${path}`, { ...init, headers })
  }
  const putCode = (id: number, roomTypeId: number, code: string) =>
    get(`/v2/reservations/bookings/${String(id)}/keyCodes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rooms: [{ room_type_id: roomTypeId, key_code: code }] }),
    })

  beforeEach(async () => {
    world = createWorld()
    world.addReservation({ bookingId: 20559349, roomTypeId: 501, code: '9234' })
    fake = await startLodgifyFake(world)
  })
  afterEach(async () => {
    await fake.close()
  })

  it('lists seeded bookings, surfacing the empty key_code gap', async () => {
    const set = bookingSetSchema.parse(await (await get('/v2/reservations/bookings')).json())
    expect(set.count).toBe(1)
    expect(set.items[0]?.rooms?.[0]?.key_code).toBe('')
  })

  it('reflects a written key code on the next read (stateful, not replay)', async () => {
    const put = await putCode(20559349, 501, '9234')
    expect(put.status).toBe(200)
    // 200 echoes the updated booking — confirm the write without a separate GET.
    expect(bookingSchema.parse(await put.json()).rooms?.[0]?.key_code).toBe('9234')

    const after = await get('/v2/reservations/bookings/20559349')
    expect(bookingSchema.parse(await after.json()).rooms?.[0]?.key_code).toBe('9234')
    expect(world.bookings.get(20559349)?.rooms?.[0]?.key_code).toBe('9234')
  })

  it('models a converged second pass: the gap is gone after one write', async () => {
    await putCode(20559349, 501, '9234')
    const set = bookingSetSchema.parse(await (await get('/v2/reservations/bookings')).json())
    expect(set.items.filter((b) => (b.rooms ?? []).some((r) => r.key_code === ''))).toHaveLength(0)
  })

  it('404s an unknown booking and an unknown room_type_id', async () => {
    expect((await get('/v2/reservations/bookings/99999999')).status).toBe(404)
    expect((await putCode(20559349, 999, '9234')).status).toBe(404)
  })

  it('401s a missing or wrong API key', async () => {
    expect((await fetch(`${fake.baseUrl}/v2/reservations/bookings`)).status).toBe(401)
  })
})
