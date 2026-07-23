import { describe, expect, it } from 'vitest'
import type { EntityHealthComponent, EntityHurtAfterEvent, World } from '@minecraft/server'

import {
  createWorld,
  emit,
  EntityComponentTypes,
  EntityDamageCause,
  livingMob,
  spawnFake,
  type AttributeComponentId,
  type EntitySpawnSpec,
} from './index.js'

// TY6 lives in the source files as Expect<Equals<keyof FakeX, keyof RealX>> next to each fake
// class; a fake growing a member beyond the real surface fails `tsc --noEmit`, not this file.

describe('typing', () => {
  // TY1: fakes pass where the real types are expected, with no casts.
  it('substitutes at object granularity with no casts', () => {
    const world: World = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const health: EntityHealthComponent | undefined = entity.getComponent('minecraft:health')
    expect(health).toBeDefined()
  })

  // TY4: mirror values carry the declared literal types.
  it('gives enum mirror members their declared literal types', () => {
    const health: 'minecraft:health' = EntityComponentTypes.Health
    expect(health).toBe('minecraft:health')
  })

  it('rejects invalid specs and payloads at compile time', () => {
    // TY2: presence is expressible only for attribute-shaped component ids.
    const nonAttribute: EntitySpawnSpec = {
      typeId: 'minecraft:zombie',
      components: {
        // @ts-expect-error minecraft:variant is not attribute-shaped
        'minecraft:variant': { current: 1, default: 1, min: 0, max: 1 },
      },
    }
    const typo: EntitySpawnSpec = {
      typeId: 'minecraft:zombie',
      components: {
        // @ts-expect-error 'helth' is not a component id
        helth: { current: 20, default: 20, min: 0, max: 20 },
      },
    }

    // TY5: the derived id union accepts both forms and rejects non-attribute ids.
    const bare: AttributeComponentId = 'health'
    const prefixed: AttributeComponentId = 'minecraft:health'
    // @ts-expect-error minecraft:variant is not attribute-shaped
    const rejected: AttributeComponentId = 'minecraft:variant'

    // TY7: typeId is required, and an attribute spec names its full value set.
    // @ts-expect-error typeId is required
    const noTypeId: EntitySpawnSpec = {}
    const partialAttribute: EntitySpawnSpec = {
      typeId: 'minecraft:zombie',
      // @ts-expect-error an attribute spec requires current, default, min, and max
      components: { 'minecraft:health': { current: 20 } },
    }

    // TY3: emit's payload is typed from the signal's handler parameter.
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })
    const event: EntityHurtAfterEvent = {
      damage: 4,
      damageSource: { cause: EntityDamageCause.entityAttack },
      hurtEntity: entity,
    }
    emit(world.afterEvents.entityHurt, event)
    // @ts-expect-error the payload must be EntityHurtAfterEvent-shaped
    emit(world.afterEvents.entityHurt, { damage: 4 })

    expect([nonAttribute, typo, bare, prefixed, rejected, noTypeId, partialAttribute]).toBeDefined()
  })
})
