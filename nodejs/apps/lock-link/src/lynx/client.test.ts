import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Fake } from '../testing/http.js'
import { startLynxFake } from '../testing/lynx-fake.js'
import { createWorld, type World } from '../testing/world.js'
import { LynxApiError, LynxClient } from './client.js'

describe('lynx client', () => {
  let world: World
  let fake: Fake
  let client: LynxClient

  beforeEach(async () => {
    world = createWorld()
    world.addReservation({ bookingId: 20559349, propertyId: 72230, code: '9234' })
    fake = await startLynxFake(world)
    client = new LynxClient({
      baseUrl: fake.baseUrl,
      username: world.credentials.username,
      password: world.credentials.password,
      userId: '232753',
    })
  })
  afterEach(async () => {
    await fake.close()
  })

  it('enumerates the active property set', async () => {
    const properties = await client.listProperties()
    expect(properties.map((p) => p.uniquePropertyId)).toEqual([72230])
  })

  it('reads reservations with code + readiness', async () => {
    const reservations = await client.listReservations(72230, 'upcoming')
    expect(reservations[0]?.confirmationCode).toBe('20559349VK222262')
    expect(reservations[0]?.accessCodes.every((c) => c.syncToLockStatus === 'success')).toBe(true)
  })

  it('reads the full lock set (readiness denominator)', async () => {
    expect(await client.listSmartLocks(72230)).toHaveLength(3)
  })

  it('logs in once and reuses the cached token across calls', async () => {
    await client.listProperties()
    await client.listReservations(72230, 'upcoming')
    await client.listSmartLocks(72230)
    const logins = world.lynxRequests.filter((r) => r.path.endsWith('/api/v1/auth/login'))
    expect(logins).toHaveLength(1)
  })

  it('throws LynxApiError when credentials are rejected', async () => {
    const bad = new LynxClient({
      baseUrl: fake.baseUrl,
      username: 'nope',
      password: 'wrong',
      userId: '232753',
    })
    await expect(bad.listProperties()).rejects.toBeInstanceOf(LynxApiError)
  })
})
