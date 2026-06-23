import { describe, expect, it } from 'vitest'

import { ConfirmationCodeError, resolveBookingId } from './resolve.js'

describe('resolveBookingId', () => {
  it('strips the VK<accountId> suffix to the Lodgify booking id', () => {
    expect(resolveBookingId('20559349VK222262', 222262)).toBe(20559349)
  })

  it('throws when the suffix is for a different account', () => {
    expect(() => resolveBookingId('20559349VK999999', 222262)).toThrow(ConfirmationCodeError)
  })

  it('throws when the suffix is missing entirely', () => {
    expect(() => resolveBookingId('20559349', 222262)).toThrow(ConfirmationCodeError)
  })

  it('throws when there is no numeric booking id before the suffix', () => {
    expect(() => resolveBookingId('VK222262', 222262)).toThrow(ConfirmationCodeError)
    expect(() => resolveBookingId('ABCVK222262', 222262)).toThrow(ConfirmationCodeError)
  })
})
