import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { propertiesResponseSchema, reservationsResponseSchema, smartLocksResponseSchema } from '../lynx/schema.js'
import { type Fake } from './http.js'
import { startLynxFake } from './lynx-fake.js'
import { createWorld, type World } from './world.js'

const PREFIX = 'https://api.getlynx.co/ProdV1.1'.slice('https://api.getlynx.co'.length)

describe('lynx fake', () => {
  let world: World
  let fake: Fake

  const login = () =>
    fetch(`${fake.baseUrl}${PREFIX}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(world.credentials),
    })

  const dashboard = (action: string, payload: Record<string, unknown>, token = world.token) =>
    fetch(`${fake.baseUrl}${PREFIX}/dashboard/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })

  beforeEach(async () => {
    world = createWorld()
    world.addReservation({ bookingId: 20559349, propertyId: 72230, code: '9234' })
    fake = await startLynxFake(world)
  })
  afterEach(async () => {
    await fake.close()
  })

  it('issues the JWT in the x-auth-token header, not the body', async () => {
    const res = await login()
    expect(res.status).toBe(200)
    expect(res.headers.get('x-auth-token')).toBe(world.token)
  })

  it('401s wrong credentials, and 401s dashboard calls with a stale token', async () => {
    const bad = await fetch(`${fake.baseUrl}${PREFIX}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y' }),
    })
    expect(bad.status).toBe(401)

    const stale = await dashboard('getReservationsByProperty', { propertyId: 72230, type: 'upcoming' }, 'stale-token')
    expect(stale.status).toBe(401)
  })

  it('returns a reservation with its code and readiness for the upcoming bucket', async () => {
    const res = await dashboard('getReservationsByProperty', { propertyId: 72230, type: 'upcoming' })
    const parsed = reservationsResponseSchema.parse(await res.json())
    const reservation = parsed.data.reservations[0]
    expect(reservation.confirmationCode).toBe('20559349VK222262')
    expect(reservation.accessCodes).toHaveLength(3)
    expect(reservation.accessCodes.every((c) => c.syncToLockStatus === 'success')).toBe(true)
  })

  it('models scheduled (not-yet-synced) codes for readiness tests', async () => {
    world.addReservation({ bookingId: 30000001, propertyId: 72230, code: '5678', synced: false })
    const res = await dashboard('getReservationsByProperty', { propertyId: 72230, type: 'upcoming' })
    const parsed = reservationsResponseSchema.parse(await res.json())
    const scheduled = parsed.data.reservations.find((r) => r.confirmationCode.startsWith('30000001'))
    expect(scheduled?.accessCodes.every((c) => c.syncToLockStatus === 'scheduled')).toBe(true)
  })

  it('clears access codes for the past bucket', async () => {
    world.addReservation({ bookingId: 40000001, propertyId: 72230, code: '1111', type: 'past' })
    const res = await dashboard('getReservationsByProperty', { propertyId: 72230, type: 'past' })
    const parsed = reservationsResponseSchema.parse(await res.json())
    expect(parsed.data.reservations[0]?.accessCodes).toHaveLength(0)
  })

  it('returns the full lock set as the readiness denominator', async () => {
    const res = await dashboard('getSmartLocksByPropertyWithStatus', { propertyId: 72230 })
    const parsed = smartLocksResponseSchema.parse(await res.json())
    expect(parsed.paginationInfo.total).toBe(3)
    expect(parsed.data.smartLocksInfo).toHaveLength(3)
  })

  it('enumerates the active property set', async () => {
    world.addProperty({ propertyId: 72231, name: 'Lakeshore' })
    const res = await dashboard('getPropertiesWithDeviceFiltersNew', {})
    const parsed = propertiesResponseSchema.parse(await res.json())
    expect(parsed.data.properties.map((p) => p.uniquePropertyId).sort()).toEqual([72230, 72231])
  })

  it('paginates', async () => {
    world.addProperty({ propertyId: 72231 })
    world.addProperty({ propertyId: 72232 })
    const res = await dashboard('getPropertiesWithDeviceFiltersNew', { page: '1', perPage: 2 })
    const parsed = propertiesResponseSchema.parse(await res.json())
    expect(parsed.data.properties).toHaveLength(2)
    expect(parsed.paginationInfo.totalPages).toBe(2)
  })
})

describe('lynx schema', () => {
  it('parses a real (scrubbed) getReservationsByProperty recording', () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/lynx-getReservationsByProperty.json', import.meta.url), 'utf8'),
    )
    const parsed = reservationsResponseSchema.parse(raw)
    expect(parsed.data.reservations[0]?.confirmationCode).toBe('20559349VK222262')
    expect(parsed.data.reservations[0]?.accessCodes[0]?.code).toBe('9234')
  })
})
