import { type IncomingMessage, type ServerResponse } from 'node:http'

import {
  propertiesResponseSchema,
  reservationsResponseSchema,
  reservationTypeSchema,
  smartLocksResponseSchema,
} from '../lynx/schema.js'
import { readBody, sendJson, startServer, type Fake } from './http.js'
import { type World } from './world.js'

/**
 * A fake of the reverse-engineered Lynx dashboard API — the read-only source side.
 * Endpoints are POSTs (a read modeled as a query-in-body POST), gated by the Bearer
 * token the `login` call issues in the `x-auth-token` *header*. Wrong creds → 401 on
 * login; missing/stale token → 401 on the dashboard calls, which is how the client's
 * token-cache + re-mint-on-401 path gets exercised.
 *
 * Reads from the shared world; never mutates it.
 */

/** Path prefix on every Lynx endpoint (`https://api.getlynx.co/ProdV1.1/...`). */
const PREFIX = '/ProdV1.1'

/** Slice `items` into a page and build Lynx's `paginationInfo`. */
const paginate = <T>(items: readonly T[], body: unknown): { page: T[]; paginationInfo: unknown } => {
  const b = (body ?? {}) as { page?: unknown; perPage?: unknown }
  const page = Number(b.page ?? 1)
  const perPage = Number(b.perPage ?? 50)
  const start = (page - 1) * perPage
  return {
    page: items.slice(start, start + perPage),
    paginationInfo: {
      perPage,
      page,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / perPage)),
    },
  }
}

const ok = <T>(data: T, paginationInfo: unknown) => ({
  status: true,
  errorCodeId: 0,
  errorMessage: '',
  data,
  paginationInfo,
})

export const startLynxFake = (world: World): Promise<Fake> =>
  startServer(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const action = path.split('/').pop() ?? ''
    world.lynxRequests.push({ method, path, action })
    const body = method === 'POST' ? await readBody(req) : undefined

    if (path === `${PREFIX}/api/v1/auth/login` && method === 'POST') {
      // Real Lynx expects the account identifier on the wire as `email`. A missing
      // `email` field (or wrong body field name) returns 400, not 401 — matches prod.
      const creds = (body ?? {}) as { email?: string; password?: string }
      if (typeof creds.email !== 'string' || typeof creds.password !== 'string') {
        sendJson(res, 400, { status: false, errorCodeId: 400, errorMessage: 'Bad request' })
        return
      }
      if (creds.email !== world.credentials.username || creds.password !== world.credentials.password) {
        sendJson(res, 401, { status: false, errorCodeId: 401, errorMessage: 'Invalid credentials' })
        return
      }
      // The token comes back in a response header, not the body.
      res.setHeader('x-auth-token', world.token)
      sendJson(res, 200, { status: true, errorCodeId: 0, errorMessage: '' })
      return
    }

    // Every dashboard call requires the issued Bearer token.
    if (req.headers.authorization !== `Bearer ${world.token}`) {
      sendJson(res, 401, { status: false, errorCodeId: 401, errorMessage: 'Unauthorized' })
      return
    }

    const b = (body ?? {}) as { propertyId?: unknown; type?: unknown }

    if (action === 'getReservationsByProperty') {
      const propertyId = Number(b.propertyId)
      const type = reservationTypeSchema.parse(b.type)
      const matched = world.reservations
        .filter((r) => r.propertyId === propertyId && r.type === type)
        .map((r) => r.reservation)
      const { page, paginationInfo } = paginate(matched, body)
      sendJson(res, 200, reservationsResponseSchema.parse(ok({ reservations: page }, paginationInfo)))
      return
    }

    if (action === 'getSmartLocksByPropertyWithStatus') {
      const locks = world.locksByProperty.get(Number(b.propertyId)) ?? []
      const { page, paginationInfo } = paginate(locks, body)
      sendJson(res, 200, smartLocksResponseSchema.parse(ok({ smartLocksInfo: page }, paginationInfo)))
      return
    }

    if (action === 'getPropertiesWithDeviceFiltersNew') {
      const properties = [...world.properties.values()]
      const { page, paginationInfo } = paginate(properties, body)
      sendJson(res, 200, propertiesResponseSchema.parse(ok({ properties: page }, paginationInfo)))
      return
    }

    sendJson(res, 404, { status: false, errorCodeId: 404, errorMessage: `No route for ${method} ${path}` })
  })
