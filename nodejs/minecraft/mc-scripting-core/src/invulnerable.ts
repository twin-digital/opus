import type { Entity, World } from '@minecraft/server'

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

// Worlds already carrying the heal-on-hurt subscription. A server session has
// a single world instance (a dedicated server hosts one level), so this holds
// at most one entry; keying on the injected world keeps the guard idempotent
// per argument rather than per module lifetime.
const guardedWorlds = new WeakSet<World>()

/**
 * Register the heal-on-hurt backstop on `world`: whenever a tagged entity takes
 * damage, heal it straight back to full. Keyed on the tag (not a type), so it
 * protects villagers now and any future NPC you tag.
 *
 * Call once during pack startup, before (or alongside) the first
 * {@link setInvulnerable}. Idempotent per world — later calls are no-ops. Safe
 * at module top level: subscribing to an event is permitted during early
 * execution; only *native* calls like `world.sendMessage` are not.
 */
export const registerInvulnerabilityGuard = (world: World): void => {
  if (guardedWorlds.has(world)) {
    return
  }
  guardedWorlds.add(world)

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
 * same tag (see {@link registerInvulnerabilityGuard}) catches anything a large
 * single hit might slip through. Idempotent, and safe on an entity that has
 * unloaded/invalidated between selection and this call.
 */
export const setInvulnerable = (
  entity: Entity,
  { enabled = true, showParticles = false }: SetInvulnerableOptions = {},
): void => {
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
