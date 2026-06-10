import { describe, expect, it } from 'vitest'
import { healthSchema } from './health.js'

describe('healthSchema', () => {
  it('accepts a well-formed health body', () => {
    expect(healthSchema.safeParse({ status: 'ok', version: '0.0.0' }).success).toBe(true)
  })

  it('rejects a body missing version', () => {
    expect(healthSchema.safeParse({ status: 'ok' }).success).toBe(false)
  })

  it('rejects a non-ok status', () => {
    expect(healthSchema.safeParse({ status: 'down', version: '0.0.0' }).success).toBe(false)
  })
})
