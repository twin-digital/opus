import { world, type Entity } from '@minecraft/server'

/** Entities carrying this tag are kept invulnerable (Resistance + heal backstop). */
export const INVULNERABLE_TAG = 'invulnerable'

// Long duration, re-applied well before it lapses (see startVillagerGuard).
// Effect durations are in ticks (20/sec) → ~1 hour.
const RESISTANCE_TICKS = 20 * 60 * 60

/**
 * Make `entity` invulnerable, or clear it when `on` is false.
 *
 * The tag is the source of truth for "this should be protected": the Resistance
 * effect stops the damage up front, and the heal-on-hurt backstop keyed on the
 * same tag (see {@link registerInvulnerabilityGuard}) catches anything a large
 * single hit might slip through. Idempotent, and safe on an entity that has
 * unloaded/invalidated between selection and this call.
 */
export const setInvulnerable = (entity: Entity, on = true): void => {
  try {
    if (on) {
      if (!entity.hasTag(INVULNERABLE_TAG)) {
        entity.addTag(INVULNERABLE_TAG)
      }
      entity.addEffect('resistance', RESISTANCE_TICKS, { amplifier: 255, showParticles: false })
    } else {
      entity.removeTag(INVULNERABLE_TAG)
      entity.removeEffect('resistance')
    }
  } catch {
    // Entity unloaded/invalidated mid-op — nothing to protect, ignore.
  }
}

/**
 * Backstop: whenever a tagged entity takes damage, heal it straight back to
 * full. Keyed on the tag (not a type), so it protects villagers now and any
 * future NPC you tag. Call once at startup.
 */
export const registerInvulnerabilityGuard = (): void => {
  world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity
    if (!entity.hasTag(INVULNERABLE_TAG)) {
      return
    }
    try {
      entity.getComponent('minecraft:health')?.resetToMaxValue()
    } catch {
      // ignore
    }
  })
}
