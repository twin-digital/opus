import { describe, expect, it } from 'vitest'

import {
  addComponent,
  createWorld,
  invalidate,
  InvalidEntityError,
  livingMob,
  NotImplementedError,
  removeComponent,
  spawnFake,
} from './index.js'

describe('attribute writes', () => {
  // CP1: writes hit the record; every handle observes them.
  it('sets the current value and reflects it across handles', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const first = entity.getComponent('minecraft:health')
    const second = entity.getComponent('health')

    expect(first?.setCurrentValue(12)).toBe(true)
    expect(second?.currentValue).toBe(12)
  })

  // CP2: bounds are inclusive; outside them the documented throw has no importable class.
  it('accepts values at the bounds and throws NotImplementedError beyond them', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const health = entity.getComponent('minecraft:health')

    expect(health?.setCurrentValue(0)).toBe(true)
    expect(health?.setCurrentValue(20)).toBe(true)
    expect(() => health?.setCurrentValue(21)).toThrow(NotImplementedError)
    expect(() => health?.setCurrentValue(-1)).toThrow(NotImplementedError)
    expect(health?.currentValue).toBe(20)
  })

  // CP3: resets go to the staged values exactly.
  it('resets to the staged default, max, and min', () => {
    const world = createWorld()
    const entity = spawnFake(world, {
      typeId: 'minecraft:zombie',
      components: { 'minecraft:health': { current: 7, default: 12, min: 2, max: 30 } },
    })
    const health = entity.getComponent('minecraft:health')

    health?.resetToDefaultValue()
    expect(health?.currentValue).toBe(12)
    health?.resetToMaxValue()
    expect(health?.currentValue).toBe(30)
    health?.resetToMinValue()
    expect(health?.currentValue).toBe(2)
  })
})

describe('validity', () => {
  // CP4: value members follow the owner; isValid and typeId keep answering.
  it('follows the owner into invalidity per the declared guards', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const health = entity.getComponent('minecraft:health')
    expect(health).toBeDefined()
    if (!health) {
      return
    }

    invalidate(entity)

    expect(health.isValid).toBe(false)
    expect(health.typeId).toBe('minecraft:health')
    expect(() => health.currentValue).toThrow(InvalidEntityError)
    expect(() => health.defaultValue).toThrow(InvalidEntityError)
    expect(() => health.effectiveMax).toThrow(InvalidEntityError)
    expect(() => health.effectiveMin).toThrow(InvalidEntityError)
    expect(() => {
      health.resetToDefaultValue()
    }).toThrow(InvalidEntityError)
    expect(() => {
      health.resetToMaxValue()
    }).toThrow(InvalidEntityError)
    expect(() => {
      health.resetToMinValue()
    }).toThrow(InvalidEntityError)
    expect(() => health.setCurrentValue(5)).toThrow(InvalidEntityError)
    expect(() => health.entity).toThrow(InvalidEntityError)
  })

  // CP5: validity is checked before staging.
  it('throws InvalidEntityError before the out-of-bounds check', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const health = entity.getComponent('minecraft:health')

    invalidate(entity)
    expect(() => health?.setCurrentValue(999)).toThrow(InvalidEntityError)
  })
})

describe('control-plane component mutation', () => {
  // CP6: add and replace on a live entity, read back through the genuine path.
  it('stages and replaces components on a live entity', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })

    addComponent(entity, 'minecraft:health', { current: 10, default: 10, min: 0, max: 10 })
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(10)

    addComponent(entity, 'health', { current: 4, default: 8, min: 0, max: 8 })
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(4)
    expect(entity.getComponent('minecraft:health')?.effectiveMax).toBe(8)
  })

  // CP7: removal restores answerable absence; surviving handles turn invalid.
  it('removes components, leaving surviving handles invalid', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const health = entity.getComponent('minecraft:health')

    removeComponent(entity, 'health')
    expect(entity.getComponent('minecraft:health')).toBeUndefined()
    expect(entity.hasComponent('minecraft:health')).toBe(false)

    expect(health?.isValid).toBe(false)
    expect(() => health?.currentValue).toThrow(NotImplementedError)

    removeComponent(entity, 'minecraft:health')
    expect(entity.hasComponent('minecraft:health')).toBe(false)
  })
})
