import { world, system, type Entity } from '@minecraft/server'

import { setInvulnerable } from '@twin-digital/mc-pack-core'

const VILLAGER = 'minecraft:villager_v2' // current villager type id
const REASSERT_INTERVAL_TICKS = 100 // 5s — tops up Resistance and catches new arrivals

/**
 * Keep every villager invulnerable: existing ones, ones that spawn (birth,
 * cured zombie), and ones whose chunk loads in. The interval also re-applies the
 * Resistance effect before it can lapse.
 *
 * Villagers live in the overworld; iterating just that dimension keeps the
 * periodic sweep cheap.
 */
export const startVillagerGuard = (): void => {
  const protectIfVillager = (entity: Entity): void => {
    if (entity.typeId === VILLAGER) {
      setInvulnerable(entity, true)
    }
  }

  world.afterEvents.entitySpawn.subscribe((event) => protectIfVillager(event.entity))
  world.afterEvents.entityLoad.subscribe((event) => protectIfVillager(event.entity))

  system.runInterval(() => {
    for (const entity of world.getDimension('overworld').getEntities({ type: VILLAGER })) {
      setInvulnerable(entity, true)
    }
  }, REASSERT_INTERVAL_TICKS)
}
