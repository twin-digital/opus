import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sendJson, startServer, type Fake } from '../testing/http.js'
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

  it('surfaces a non-JSON body as a LodgifyApiError with the status, not a SyntaxError', async () => {
    // A CDN/proxy can return an HTML 5xx, or a non-JSON 2xx; both must stay typed errors.
    const gateway502 = await startServer((_req, res) => {
      res.writeHead(502, { 'content-type': 'text/html' })
      res.end('<html>502 Bad Gateway</html>')
    })
    const ok200 = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>not json</html>')
    })
    try {
      await expect(new LodgifyClient({ baseUrl: gateway502.baseUrl, apiKey: 'k' }).getBooking(1)).rejects.toMatchObject(
        {
          name: 'LodgifyApiError',
          status: 502,
        },
      )
      await expect(new LodgifyClient({ baseUrl: ok200.baseUrl, apiKey: 'k' }).getBooking(1)).rejects.toMatchObject({
        name: 'LodgifyApiError',
        status: 200,
      })
    } finally {
      await Promise.all([gateway502.close(), ok200.close()])
    }
  })

  it('re-fetches from page 1 with a larger window so a mid-walk shrink cannot hide the tail', async () => {
    const booking = world.bookings.get(20559349)
    if (!booking) {
      throw new Error('expected seeded booking')
    }
    const page1 = Array.from({ length: 50 }, (_, i) => ({ ...booking, id: i + 1 }))
    const shrunk = Array.from({ length: 50 }, (_, i) => ({ ...booking, id: i + 2 }))
    const sizes: number[] = []
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://lodgify.test')
      sizes.push(Number(url.searchParams.get('size') ?? '50'))
      sendJson(res, 200, { count: null, items: sizes.length === 1 ? page1 : shrunk })
    })
    try {
      const items = await new LodgifyClient({ baseUrl: server.baseUrl, apiKey: 'k' }).listAllBookings()
      expect(sizes).toEqual([50, 100])
      expect(items.map((b) => b.id)).toEqual(shrunk.map((b) => b.id))
      expect(items.at(-1)?.id).toBe(51)
    } finally {
      await server.close()
    }
  })
})
