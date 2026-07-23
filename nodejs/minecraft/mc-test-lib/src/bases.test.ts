import { describe, expect, it } from 'vitest'

import { createWorld, livingMob, spawnFake } from './index.js'

describe('livingMob', () => {
  // BA1: bases are inert data, applied only by explicit merge.
  it('is opt-in: a spawn without it stages nothing', () => {
    const world = createWorld()
    const bare = spawnFake(world, { typeId: 'minecraft:villager_v2' })
    expect(bare.hasComponent('minecraft:health')).toBe(false)

    const living = spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })
    const health = living.getComponent('minecraft:health')
    expect(health?.currentValue).toBe(20)
    expect(health?.defaultValue).toBe(20)
    expect(health?.effectiveMin).toBe(0)
    expect(health?.effectiveMax).toBe(20)
  })

  // BA2: composition is plain object spread — later entries win.
  it('composes by spread order', () => {
    const world = createWorld()
    const wounded = spawnFake(world, {
      ...livingMob,
      typeId: 'minecraft:villager_v2',
      components: {
        ...livingMob.components,
        'minecraft:health': { current: 5, default: 20, min: 0, max: 20 },
      },
    })
    expect(wounded.getComponent('minecraft:health')?.currentValue).toBe(5)
  })

  // BA3: spawns share no state with each other or with the base object.
  it('shares no state between spawns or with the base', () => {
    const world = createWorld()
    const first = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const second = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    first.applyDamage(5)

    expect(first.getComponent('minecraft:health')?.currentValue).toBe(15)
    expect(second.getComponent('minecraft:health')?.currentValue).toBe(20)
    expect(livingMob.components?.['minecraft:health']?.current).toBe(20)
  })
})
