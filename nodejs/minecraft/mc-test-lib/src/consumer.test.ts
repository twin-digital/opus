import type { Entity, World } from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { createWorld, emit, EntityDamageCause, invalidate, livingMob, spawnFake } from './index.js'

/**
 * The motivating consumer shape, inlined from mc-scripting-core's invulnerability helpers: a
 * heal-on-hurt backstop keyed on a tag, guarded by try/catch because the hit that fires the
 * event can be the hit that unloaded the entity.
 */
const INVULNERABLE_TAG = 'invulnerable'

const registerInvulnerabilityGuard = (world: World): void => {
  world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity
    try {
      if (!entity.hasTag(INVULNERABLE_TAG)) {
        return
      }
      entity.getComponent('minecraft:health')?.resetToMaxValue()
    } catch {
      // Entity unloaded/invalidated between the hit and this heal — ignore.
    }
  })
}

const setInvulnerable = (entity: Entity, enabled = true): void => {
  try {
    if (enabled) {
      if (!entity.hasTag(INVULNERABLE_TAG)) {
        entity.addTag(INVULNERABLE_TAG)
      }
      entity.addEffect('resistance', 20 * 60 * 60, { amplifier: 255 })
    } else {
      entity.removeTag(INVULNERABLE_TAG)
      entity.removeEffect('resistance')
    }
  } catch {
    // Entity unloaded/invalidated mid-op — nothing to protect, ignore.
  }
}

describe('the motivating consumer slice', () => {
  // CO1: the invulnerability pattern runs unmodified against the fakes.
  it('heals tagged mobs on hurt and leaves untagged mobs damaged', () => {
    const world = createWorld()
    registerInvulnerabilityGuard(world)

    const protectedMob = spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })
    const ordinaryMob = spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })
    setInvulnerable(protectedMob)

    protectedMob.applyDamage(12)
    ordinaryMob.applyDamage(12)

    expect(protectedMob.getComponent('minecraft:health')?.currentValue).toBe(20)
    expect(protectedMob.getEffect('resistance')?.amplifier).toBe(255)
    expect(ordinaryMob.getComponent('minecraft:health')?.currentValue).toBe(8)
  })

  it('survives the hit that unloaded the entity', () => {
    const world = createWorld()
    registerInvulnerabilityGuard(world)

    const mob = spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })
    setInvulnerable(mob)

    invalidate(mob)
    expect(() => {
      emit(world.afterEvents.entityHurt, {
        damage: 19,
        damageSource: { cause: EntityDamageCause.entityAttack },
        hurtEntity: mob,
      })
    }).not.toThrow()

    expect(() => {
      setInvulnerable(mob, false)
    }).not.toThrow()
  })
})
