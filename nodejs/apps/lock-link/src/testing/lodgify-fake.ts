import { type IncomingMessage, type ServerResponse } from 'node:http'

import { bookingSchema, bookingSetSchema, keyCodesSchema, putKeyCodesRequestSchema } from '../lodgify/schema.js'
import { readBody, sendJson, startServer, type Fake } from './http.js'
import { type World } from './world.js'

/**
 * A stateful in-memory fake of the Lodgify v2 API — just the handful of endpoints the
 * sync touches. Unlike canned-response replay, it *behaves*: a `PUT keyCodes` mutates
 * the booking in the shared world, and the next `GET` reflects it. That makes the loop's
 * real correctness story testable — write a code, read it back to confirm, run again,
 * second pass is a no-op because it converged.
 *
 * Point a Lodgify client's base URL at `baseUrl`; assert against the world you seeded.
 * One server per test (ephemeral port); call `close()` when done.
 */

/** Lodgify's error envelope: a typed `code`, a `message`, and a correlation id. */
const sendError = (res: ServerResponse, status: number, code: string, message: string): void => {
  sendJson(res, status, { code, message, correlation_id: `fake-${String(status)}` })
}

export const startLodgifyFake = (world: World): Promise<Fake> =>
  startServer(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    world.lodgifyRequests.push({ method, path })

    if (req.headers['x-apikey'] !== world.lodgifyApiKey) {
      sendError(res, 401, 'Unauthorized', 'Invalid or missing X-ApiKey')
      return
    }

    const keyCodesMatch = /^\/v2\/reservations\/bookings\/(\d+)\/keyCodes$/.exec(path)
    if (keyCodesMatch && method === 'PUT') {
      const id = Number(keyCodesMatch[1])
      const booking = world.bookings.get(id)
      if (!booking) {
        sendError(res, 404, 'NotFound', `Booking ${String(id)} not found`)
        return
      }
      const body = putKeyCodesRequestSchema.parse(await readBody(req))
      // Resolve every target room BEFORE mutating anything, so a partial-then-404 write
      // can't leave the shared world half-updated (real Lodgify doesn't half-apply either).
      const resolved: { room: NonNullable<typeof booking.rooms>[number]; keyCode: string }[] = []
      for (const update of body.rooms) {
        const room = booking.rooms?.find((r) => r.room_type_id === update.room_type_id)
        if (!room) {
          sendError(res, 404, 'NotFound', `room_type_id ${String(update.room_type_id)} not on booking ${String(id)}`)
          return
        }
        resolved.push({ room, keyCode: update.key_code })
      }
      for (const { room, keyCode } of resolved) {
        room.key_code = keyCode
      }
      // Lodgify echoes only the updated rooms (BookingKeyCodeDto), not a full booking.
      sendJson(
        res,
        200,
        keyCodesSchema.parse({
          rooms: (booking.rooms ?? []).map((r) => ({ room_type_id: r.room_type_id, key_code: r.key_code })),
        }),
      )
      return
    }

    const bookingMatch = /^\/v2\/reservations\/bookings\/(\d+)$/.exec(path)
    if (bookingMatch && method === 'GET') {
      const booking = world.bookings.get(Number(bookingMatch[1]))
      if (!booking) {
        sendError(res, 404, 'NotFound', `Booking ${bookingMatch[1]} not found`)
        return
      }
      sendJson(res, 200, bookingSchema.parse(booking))
      return
    }

    if (path === '/v2/reservations/bookings' && method === 'GET') {
      const items = [...world.bookings.values()].filter((b) => !b.is_deleted)
      sendJson(res, 200, bookingSetSchema.parse({ count: items.length, items }))
      return
    }

    sendError(res, 404, 'NotFound', `No route for ${method} ${path}`)
  })
