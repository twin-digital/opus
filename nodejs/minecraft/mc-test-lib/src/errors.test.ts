import { describe, expect, it } from 'vitest'

import { createWorld, invalidate, InvalidEntityError, NotImplementedError, spawnFake } from './index.js'

describe('InvalidEntityError', () => {
  // ER1: declared name and shape — extends Error, carries id and type.
  it('matches the declared shape', () => {
    const error = new InvalidEntityError('-42', 'minecraft:zombie')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InvalidEntityError')
    expect(error.id).toBe('-42')
    expect(error.type).toBe('minecraft:zombie')
  })
})

describe('NotImplementedError', () => {
  // ER2: extends Error and names the missing member.
  it('extends Error and names what is missing', () => {
    const error = new NotImplementedError('Entity.teleport')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('NotImplementedError')
    expect(error.message).toContain('Entity.teleport')
  })
})

describe('catching by class', () => {
  // ER3: fakes throw these classes, catchable by instanceof.
  it('guard throws are InvalidEntityError, stub throws NotImplementedError', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })

    expect(() => {
      entity.teleport({ x: 0, y: 0, z: 0 })
    }).toThrow(NotImplementedError)

    invalidate(entity)
    expect(() => entity.hasTag('any')).toThrow(InvalidEntityError)
  })
})
