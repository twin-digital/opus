import { describe, expect, it } from 'vitest'
import { checkBehaviors } from './check-behaviors.js'

const behavior = (id: string) => ({ id, componentType: 'ct_x', update: (fields: unknown) => fields })

describe('checkBehaviors', () => {
  it('returns a correct list as it is', () => {
    const list = [behavior('a'), behavior('b')]
    expect(checkBehaviors(list)).toBe(list)
    const empty: unknown[] = []
    expect(checkBehaviors(empty)).toBe(empty)
  })

  it('refuses a value that is not an array', () => {
    for (const value of [undefined, null, {}, 'a', 3]) {
      expect(() => checkBehaviors(value)).toThrow(TypeError)
      expect(() => checkBehaviors(value)).toThrow(/not a list/)
    }
  })

  it('refuses an item that is not an object', () => {
    expect(() => checkBehaviors([behavior('a'), null])).toThrow(/position 1 is not an object/)
    expect(() => checkBehaviors([behavior('a'), 'x'])).toThrow(/position 1 is not an object/)
  })

  it('refuses an item with no text id and names the position', () => {
    expect(() => checkBehaviors([{ ...behavior('a'), id: 3 }])).toThrow(/position 0/)
    expect(() => checkBehaviors([behavior('a'), { componentType: 'x', update: () => ({}) }])).toThrow(/position 1/)
  })

  it('refuses an empty id', () => {
    expect(() => checkBehaviors([behavior('')])).toThrow(/position 0.*id/)
  })

  it('refuses an item with no text componentType', () => {
    expect(() => checkBehaviors([{ ...behavior('a'), componentType: 4 }])).toThrow(/position 0.*componentType/)
    expect(() => checkBehaviors([{ id: 'a', update: () => ({}) }])).toThrow(/componentType/)
  })

  it('refuses an item with no function update and names the position', () => {
    const run = () => checkBehaviors([behavior('a'), { id: 'b', componentType: 'x', update: 'no' }])
    expect(run).toThrow(TypeError)
    expect(run).toThrow(/position 1.*update/)
  })

  it('refuses two items with one ID and names the ID', () => {
    const run = () => checkBehaviors([behavior('count'), behavior('other'), behavior('count')])
    expect(run).toThrow(TypeError)
    expect(run).toThrow(/"count"/)
  })
})
