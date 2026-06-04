import { describe, it, expect } from 'vitest'

import { removeEmptyValues } from './remove-empty-values.js'

describe('removeEmptyValues', () => {
  it('drops undefined, empty arrays, and empty objects from object properties', () => {
    const result = removeEmptyValues({
      keep: 'value',
      gone: undefined,
      emptyArr: [],
      emptyObj: {},
      nested: { keep: 1, drop: {} },
    })

    expect(result).toEqual({ keep: 'value', nested: { keep: 1 } })
  })

  it('prunes recursively, collapsing objects that become empty', () => {
    const result = removeEmptyValues({ a: { b: { c: {} } } })

    // a.b.c is empty -> b becomes empty -> a becomes empty -> whole thing empty
    expect(result).toEqual({})
  })

  it('maps array entries but does not filter empties out of arrays', () => {
    const result = removeEmptyValues({ list: [{ keep: 1, drop: undefined }, {}, []] })

    expect(result).toEqual({ list: [{ keep: 1 }, {}, []] })
  })

  it('leaves non-plain objects (e.g. Date) intact', () => {
    const date = new Date(0)
    const result = removeEmptyValues({ when: date }) as { when: Date }

    expect(result.when).toBe(date)
  })

  it('preserves falsy-but-meaningful primitives', () => {
    const result = removeEmptyValues({ zero: 0, no: false, empty: '', nul: null })

    expect(result).toEqual({ zero: 0, no: false, empty: '', nul: null })
  })

  it('does not infinitely recurse on circular references', () => {
    const circular: Record<string, unknown> = { name: 'root' }
    circular.self = circular

    expect(() => removeEmptyValues(circular)).not.toThrow()
  })
})
