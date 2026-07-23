import type { EntitySpawnBase } from './control.js'

/**
 * Base for a living mob: a vanilla-typical health set (20/20, bounded 0–20), matching the
 * villagers, zombies, and similar mobs the motivating tests damage. Opt in by explicit merge
 * and override by spreading after it:
 *
 * ```typescript
 * const villager = spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })
 * ```
 */
export const livingMob: EntitySpawnBase = {
  components: {
    'minecraft:health': { current: 20, default: 20, min: 0, max: 20 },
  },
}
