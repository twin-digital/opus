import { world, type Entity } from '@minecraft/server'

/** Entities carrying this tag are kept invulnerable (Resistance + heal backstop). */
export const INVULNERABLE_TAG = 'invulnerable'

// Long duration, re-applied well before it lapses (see startVillagerGuard).
// Effect durations are in ticks (20/sec) → ~1 hour.
const RESISTANCE_TICKS = 20 * 60 * 60

/** Options for {@link setInvulnerable}. */
export interface SetInvulnerableOptions {
  /** Whether the entity should be invulnerable. `false` clears the tag and effect. Default `true`. */
  enabled?: boolean

  /** Show the Resistance effect's ambient particles. Default `false` — protection is invisible. */
  showParticles?: boolean
}

let guardRegistered = false

/**
 * Register the heal-on-hurt backstop: whenever a tagged entity takes damage,
 * heal it straight back to full. Keyed on the tag (not a type), so it protects
 * villagers now and any future NPC you tag.
 *
 * Called automatically the first time {@link setInvulnerable} runs, so packs
 * never have to wire it up. Idempotent — later calls are no-ops. Safe to invoke
 * from any context setInvulnerable reaches (event callbacks, intervals, or even
 * module top level: subscribing to an event is permitted during early
 * execution; only *native* calls like `world.sendMessage` are not).
 */
export const registerInvulnerabilityGuard = (): void => {
  if (guardRegistered) {
    return
  }
  guardRegistered = true

  world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity
    if (!entity.hasTag(INVULNERABLE_TAG)) {
      return
    }
    try {
      entity.getComponent('minecraft:health')?.resetToMaxValue()
    } catch {
      // Entity unloaded/invalidated between the hit and this heal — ignore.
    }
  })
}

/**
 * Make `entity` invulnerable, or clear it with `{ enabled: false }`.
 *
 * The tag is the source of truth for "this should be protected": the Resistance
 * effect stops the damage up front, and the heal-on-hurt backstop keyed on the
 * same tag (see {@link registerInvulnerabilityGuard}, registered automatically
 * on first use) catches anything a large single hit might slip through.
 * Idempotent, and safe on an entity that has unloaded/invalidated between
 * selection and this call.
 */
export const setInvulnerable = (
  entity: Entity,
  { enabled = true, showParticles = false }: SetInvulnerableOptions = {},
): void => {
  registerInvulnerabilityGuard()
  try {
    if (enabled) {
      if (!entity.hasTag(INVULNERABLE_TAG)) {
        entity.addTag(INVULNERABLE_TAG)
      }
      entity.addEffect('resistance', RESISTANCE_TICKS, { amplifier: 255, showParticles })
    } else {
      entity.removeTag(INVULNERABLE_TAG)
      entity.removeEffect('resistance')
    }
  } catch {
    // Entity unloaded/invalidated mid-op — nothing to protect, ignore.
  }
}
