import type { Dimension, Entity, EntityDamageCause, EntityHurtAfterEvent } from '@minecraft/server'
import {
  addComponent,
  asSpawnedEntity,
  advanceTicks,
  createEntity,
  createPlayer,
  createServer,
  getOutput,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { beforeEach, describe, expect, it } from 'vitest'

import { installProtection, PROTECTED_TYPE_IDS } from './protection.js'

// The enum is a value export of `@minecraft/server`, which ships no runtime module, so a cause is
// named by its own string.
const cause = (name: string): EntityDamageCause => name as EntityDamageCause

const MAX_HEALTH = 20
/** More than any protected mob's health, so an unprotected subject dies of one hit. */
const LETHAL = 100

let server: FakeServer
let overworld: Dimension
let hurtEvents: EntityHurtAfterEvent[]

/** Every subject starts at full health, in the overworld, with the spawn frame's field values. */
const spawn = (typeId: string, dimension: Dimension = overworld): Entity => {
  const entity = createEntity(server, { typeId, dimension })
  asSpawnedEntity(entity)
  addComponent(entity, 'minecraft:health', MAX_HEALTH)
  return entity
}

const healthOf = (entity: Entity): number | undefined => entity.getComponent('minecraft:health')?.currentValue

beforeEach(() => {
  server = createServer()
  withVanillaDimensions(server)
  overworld = server.world.getDimension('overworld')
  installProtection(server)
  // Subscribed after the pack, so it observes what the pack left of each hit.
  hurtEvents = []
  server.world.afterEvents.entityHurt.subscribe((event) => {
    hurtEvents.push(event)
  })
})

describe('the protected set', () => {
  it.each([...PROTECTED_TYPE_IDS])('keeps %s alive at full health through a lethal hit', (typeId) => {
    const subject = spawn(typeId)
    const zombie = spawn('minecraft:zombie')

    subject.applyDamage(LETHAL, { cause: cause('entityAttack'), damagingEntity: zombie })

    expect(subject.isValid).toBe(true)
    expect(healthOf(subject)).toBe(MAX_HEALTH)
  })

  it('leaves a mob outside the set to die', () => {
    const sheep = spawn('minecraft:sheep')

    sheep.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(healthOf(sheep)).toBe(MAX_HEALTH - LETHAL)
  })

  it('protects a mob that arrives after the subscriptions were taken', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })

  it.each(['overworld', 'nether', 'the_end'])('protects a mob in the %s', (dimensionId) => {
    const villager = spawn('minecraft:villager_v2', server.world.getDimension(dimensionId))

    villager.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })
})

describe('a hit no player dealt', () => {
  it('still lands, written down to a survivable amount', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(hurtEvents.map((event) => event.damage)).toEqual([0.5])
    expect(hurtEvents[0]?.damageSource.cause).toBe('entityAttack')
  })

  it('is not written up when it was already smaller than the clamp', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(0.25, { cause: cause('fireTick') })

    expect(hurtEvents.map((event) => event.damage)).toEqual([0.25])
    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })

  it.each(['entityAttack', 'fire', 'fireTick', 'fall', 'drowning', 'suffocation', 'blockExplosion'])(
    'survives an ordinary %s',
    (name) => {
      const villager = spawn('minecraft:villager_v2')

      villager.applyDamage(LETHAL, { cause: cause(name) })

      expect(villager.isValid).toBe(true)
      expect(healthOf(villager)).toBe(MAX_HEALTH)
    },
  )

  it('does not let the losses accumulate under sustained attack', () => {
    const villager = spawn('minecraft:villager_v2')
    const zombie = spawn('minecraft:zombie')

    for (let hit = 0; hit < 200; hit += 1) {
      villager.applyDamage(LETHAL, { cause: cause('entityAttack'), damagingEntity: zombie })
    }

    expect(villager.isValid).toBe(true)
    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })

  it('restores a mob that was already below full health', () => {
    const villager = spawn('minecraft:villager_v2')
    villager.getComponent('minecraft:health')?.setCurrentValue(7)

    villager.applyDamage(3, { cause: cause('entityAttack') })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
  })
})

describe("a player's own hit", () => {
  it('does nothing at all in melee', () => {
    const villager = spawn('minecraft:villager_v2')
    const player = createPlayer(server, { dimension: overworld })

    villager.applyDamage(8, { cause: cause('entityAttack'), damagingEntity: player })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
    expect(hurtEvents).toEqual([])
  })

  it('does nothing at all by a projectile the player loosed', () => {
    const villager = spawn('minecraft:villager_v2')
    const player = createPlayer(server, { dimension: overworld })
    const arrow = createEntity(server, { typeId: 'minecraft:arrow', dimension: overworld })

    villager.applyDamage(8, { damagingEntity: player, damagingProjectile: arrow })

    expect(healthOf(villager)).toBe(MAX_HEALTH)
    expect(hurtEvents).toEqual([])
  })

  it('is left alone on a mob outside the set', () => {
    const sheep = spawn('minecraft:sheep')
    const player = createPlayer(server, { dimension: overworld })

    sheep.applyDamage(8, { cause: cause('entityAttack'), damagingEntity: player })

    expect(healthOf(sheep)).toBe(MAX_HEALTH - 8)
  })
})

describe('an operator', () => {
  it('can kill a protected mob outright', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.kill()

    expect(healthOf(villager)).toBe(0)
  })

  it('can drive a protected mob down with an override', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(LETHAL, { cause: cause('override') })

    expect(healthOf(villager)).toBe(MAX_HEALTH - LETHAL)
  })

  it('can drive a protected mob down with a selfDestruct', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(LETHAL, { cause: cause('selfDestruct') })

    expect(healthOf(villager)).toBe(MAX_HEALTH - LETHAL)
  })
})

describe('the protection adds nothing of its own', () => {
  it('leaves a hit mob carrying no effect, no name tag and no chat output', () => {
    const villager = spawn('minecraft:villager_v2')

    villager.applyDamage(LETHAL, { cause: cause('entityAttack') })

    expect(villager.getEffects()).toEqual([])
    expect(villager.nameTag).toBe('')
    expect(getOutput(server.world)).toEqual([])
  })

  it('runs nothing on a schedule: an untouched mob keeps whatever health it has', () => {
    const villager = spawn('minecraft:villager_v2')
    villager.getComponent('minecraft:health')?.setCurrentValue(7)

    advanceTicks(server, 200)

    expect(healthOf(villager)).toBe(7)
    expect(hurtEvents).toEqual([])
  })
})
