/**
 * The default path: static imports alone. No install call, no reset prelude, no ordering this file
 * writes — the plugin's setup module installed a server before this file evaluated, and the pack's
 * module-scope registrations landed on it.
 */

import {
  addComponent,
  advanceTicks,
  createEntity,
  createPlayer,
  currentServer,
  withVanillaDimensions,
} from '@twin-digital/minecraft-test-lib'
import { Entity, EntityDamageCause, Player, system, world } from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { hurtLog } from './pack.js'

describe('an unmodified pack under the one-entry install', () => {
  it('loaded, with every value import resolved', () => {
    expect(hurtLog).toEqual([])
  })

  it('subscribed to the server the setup module installed', () => {
    const server = currentServer()
    withVanillaDimensions(server)
    const sheep = createEntity(server, {
      typeId: 'minecraft:sheep',
      dimension: world.getDimension('overworld'),
    })
    addComponent(sheep, 'minecraft:health', 20)
    sheep.applyDamage(1, { cause: EntityDamageCause.entityAttack })
    expect(hurtLog).toEqual(['entity:attack'])
  })

  it('registered its scheduled loop on the same server', () => {
    const before = system.currentTick
    advanceTicks(currentServer(), 3)
    expect(system.currentTick).toBe(before + 3)
  })
})

describe('instanceof across the alias', () => {
  it('answers true inside the pack for a fake the test built', () => {
    const server = currentServer()
    withVanillaDimensions(server)
    const player = createPlayer(server, { dimension: world.getDimension('overworld') })
    addComponent(player, 'minecraft:health', 20)
    player.applyDamage(1, { cause: EntityDamageCause.entityAttack })
    expect(hurtLog).toContain('player:attack')
  })

  it('answers true for the class the test imports from @minecraft/server', () => {
    const player = createPlayer(currentServer(), {})
    expect(player).toBeInstanceOf(Player)
    expect(player).toBeInstanceOf(Entity)
    expect({}).not.toBeInstanceOf(Entity)
  })
})
