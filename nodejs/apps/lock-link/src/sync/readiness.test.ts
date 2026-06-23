import { describe, expect, it } from 'vitest'

import { createWorld } from '../testing/world.js'
import { checkReadiness } from './readiness.js'

/** Pull a seeded reservation + its property lock set out of the world. */
const seed = (spec: Parameters<ReturnType<typeof createWorld>['addReservation']>[0]) => {
  const world = createWorld()
  world.addReservation(spec)
  const propertyId = spec.propertyId ?? 72230
  const reservation = world.reservations[0].reservation
  const lockSet = world.locksByProperty.get(propertyId) ?? []
  return { reservation, lockSet }
}

describe('checkReadiness', () => {
  it('is ready when every lock is covered, all success, one code', () => {
    const { reservation, lockSet } = seed({ bookingId: 1, code: '9234' })
    const result = checkReadiness(reservation, lockSet)
    expect(result.ready).toBe(true)
    expect(result.code).toBe('9234')
    expect(result.reasons).toEqual([])
  })

  it('is not ready while a lock is still scheduled', () => {
    const { reservation, lockSet } = seed({ bookingId: 1, code: '9234', synced: false })
    const result = checkReadiness(reservation, lockSet)
    expect(result.ready).toBe(false)
    expect(result.code).toBeUndefined()
    expect(result.reasons.some((r) => r.includes('scheduled'))).toBe(true)
  })

  it('is not ready when the codes do not cover every lock', () => {
    const { reservation, lockSet } = seed({ bookingId: 1, code: '9234', coveredLocks: ['Dalton Door'] })
    const result = checkReadiness(reservation, lockSet)
    expect(result.ready).toBe(false)
    expect(result.reasons.some((r) => r.includes('no access code'))).toBe(true)
  })

  it('is not ready when codes differ across locks', () => {
    const { reservation, lockSet } = seed({ bookingId: 1, code: '9234' })
    reservation.accessCodes[1].code = '0000'
    const result = checkReadiness(reservation, lockSet)
    expect(result.ready).toBe(false)
    expect(result.reasons.some((r) => r.includes('differ'))).toBe(true)
  })

  it('is not ready when the reservation has no codes yet', () => {
    const { reservation, lockSet } = seed({ bookingId: 1 })
    const result = checkReadiness(reservation, lockSet)
    expect(result.ready).toBe(false)
    expect(result.reasons.some((r) => r.includes('no access code'))).toBe(true)
  })
})
