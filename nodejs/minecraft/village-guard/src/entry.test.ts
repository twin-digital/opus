/**
 * The pack's entry point — `src/main.ts`, the one file the engine executes — is exercised here as
 * the engine executes it: evaluated for its side effects, against a world it reached through its
 * own `@minecraft/server` import. The rest of the suite drives
 * `installProtection` with handles it passes in, so it would pass unchanged against an entry that
 * imported the wrong name, called nothing, or handed over the wrong object. This file is what fails
 * in that case.
 *
 * `loadPack` is the shape for it: load-time behaviour is the subject, and each test needs the entry
 * evaluated fresh against a world no previous one touched. It hands back the server the entry
 * registered against, and every assertion below reads that server.
 *
 * `@minecraft/server` ships type declarations and no runtime module, so the entry's import of it
 * resolves under no runner without the vitest plugin `@twin-digital/minecraft-test-lib` ships. This
 * file runs under that plugin, which the package's `vitest.config.d/` fragment installs.
 */

import type { Entity, EntityDamageCause, EntityHurtBeforeEvent } from '@minecraft/server'
import {
  addComponent,
  asSpawnedEntity,
  createEntity,
  emit,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { loadPack } from '@twin-digital/minecraft-test-lib/vitest'
import { beforeEach, describe, expect, it } from 'vitest'

// The enum is a value export of `@minecraft/server`, which ships no runtime module, so a cause is
// named by its own string.
const cause = (name: string): EntityDamageCause => name as EntityDamageCause

const MAX_HEALTH = 20
/** More than any protected mob's health, so an unprotected subject dies of one hit. */
const LETHAL = 100

let server: FakeServer

const spawn = (typeId: string): Entity => {
  const entity = createEntity(server, { typeId, dimension: server.world.getDimension('overworld') })
  asSpawnedEntity(entity)
  addComponent(entity, 'minecraft:health', MAX_HEALTH)
  return entity
}

const healthOf = (entity: Entity): number | undefined => entity.getComponent('minecraft:health')?.currentValue

describe('the pack entry point', () => {
  beforeEach(async () => {
    // The entry evaluates here, against a world of its own and nothing this file hands it.
    server = await loadPack(() => import('./main.js'))
    withVanillaDimensions(server)
  })

  it('takes the before-hurt subscription on the world it imported', () => {
    const villager = spawn('minecraft:villager_v2')
    const event = {
      cancel: false,
      damage: LETHAL,
      damageSource: { cause: cause('entityAttack') },
      hurtEntity: villager,
    } as unknown as EntityHurtBeforeEvent

    emit(server.world.beforeEvents.entityHurt, event)

    expect(event.damage).toBe(0)
  })

  it('takes the after-hurt subscription on the world it imported', () => {
    const villager = spawn('minecraft:villager_v2')
    villager.getComponent('minecraft:health')?.setCurrentValue(1)

    emit(server.world.afterEvents.entityHurt, {
      damage: 0,
      damageSource: { cause: cause('entityAttack') },
      hurtEntity: villager,
    })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })

  it('keeps a villager alive through a lethal hit', () => {
    const villager = spawn('minecraft:villager_v2')
    const zombie = spawn('minecraft:zombie')

    villager.applyDamage(LETHAL, { cause: cause('entityAttack'), damagingEntity: zombie })

    expect(villager.isValid).toBe(true)
    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })

  it('leaves a mob outside the protected set to die', () => {
    const sheep = spawn('minecraft:sheep')

    sheep.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(healthOf(sheep)).toBe(MAX_HEALTH - LETHAL)
  })
})
