import { describe, expect, it } from 'vitest'

import { parseWorldsRecord, renderWorldsRecord, seedsOf, withWorld } from './seed-record.js'

describe('the worlds record', () => {
  // d-5ocyva9w — the seed a world was generated from cannot be read back any other way
  it('round-trips a 64-bit seed exactly', () => {
    const record = withWorld({ version: 1, worlds: {} }, 'dev', -9223372036854775808n)

    expect(seedsOf(parseWorldsRecord(renderWorldsRecord(record))).dev).toBe(-9223372036854775808n)
  })

  it('keeps a world already on record when another is added', () => {
    const first = withWorld({ version: 1, worlds: {} }, 'dev', 1n)
    const both = withWorld(first, 'other', 2n)

    expect(seedsOf(both)).toEqual({ dev: 1n, other: 2n })
  })

  // a record is history, not state: anything unreadable is simply no record
  it.each(['', 'not json', '{"version":2}', '{"version":1}'])('reads %s as empty', (text) => {
    expect(parseWorldsRecord(text).worlds).toEqual({})
  })

  it('drops a seed that will not parse', () => {
    expect(seedsOf(parseWorldsRecord('{"version":1,"worlds":{"dev":{"seed":"soon"}}}'))).toEqual({})
  })
})
