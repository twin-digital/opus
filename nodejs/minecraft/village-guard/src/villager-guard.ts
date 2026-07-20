import { world, system, type Entity } from '@minecraft/server'

import { registerInvulnerabilityGuard, setInvulnerable } from '@twin-digital/mc-scripting-core'

const VILLAGER = 'minecraft:villager_v2' // current villager type id
const REASSERT_INTERVAL_TICKS = 100 // 5s — tops up Resistance and catches new arrivals

/**
 * Keep every villager invulnerable: existing ones, ones that spawn (birth,
 * cured zombie), and ones whose chunk loads in.
 *
 * Villagers live in the overworld; iterating just that dimension keeps the
 * sweep cheap.
 */
export const startVillagerGuard = (): void => {
  registerInvulnerabilityGuard(world)

  const protectIfVillager = (entity: Entity): void => {
    if (entity.typeId === VILLAGER) {
      setInvulnerable(entity)
    }
  }

  const sweep = (): void => {
    for (const entity of world.getDimension('overworld').getEntities({ type: VILLAGER })) {
      setInvulnerable(entity)
    }
  }

  world.afterEvents.entitySpawn.subscribe((event) => {
    protectIfVillager(event.entity)
  })
  world.afterEvents.entityLoad.subscribe((event) => {
    protectIfVillager(event.entity)
  })

  // Villagers already loaded when the script starts (world start, /reload, pack
  // newly enabled) never fire spawn/load — protect them right away. Deferred to
  // system.run because this runs during early execution, when native calls like
  // getEntities are not allowed.
  system.run(sweep)

  // The events cover arrivals; the recurring sweep covers what they can't:
  // Resistance is a finite-duration effect that would otherwise lapse on
  // long-loaded villagers, and the tag/effect can be stripped externally
  // (commands, other packs). One filtered query over loaded overworld entities
  // every 5s — negligible.
  system.runInterval(sweep, REASSERT_INTERVAL_TICKS)
}
