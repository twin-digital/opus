/**
 * The whole of village-guard: two `entityHurt` subscriptions that keep a protected mob alive
 * without changing anything else about it.
 *
 * A hit reaching a protected mob is split three ways on its damage source. An operator's
 * deliberate removal lands untouched, a player's hit is cancelled so it does nothing at all, and
 * everything else is written down to nothing and the mob restored to full health in the same tick.
 * A written-down hit still knocks back, so a siege still looks like a siege.
 */

import type { EntityDamageSource, World } from '@minecraft/server'

/** The vanilla type ids the pack protects. Fixed in the pack; nothing configures it. */
export const PROTECTED_TYPE_IDS: readonly string[] = [
  'minecraft:villager_v2',
  'minecraft:wandering_trader',
  'minecraft:iron_golem',
]

const protectedTypeIds = new Set(PROTECTED_TYPE_IDS)

/**
 * The causes the engine gives a deliberate removal rather than gameplay, so an operator keeps the
 * ability to kill a protected mob outright.
 */
const OPERATOR_CAUSES = new Set<string>(['selfDestruct', 'override'])

const PLAYER_TYPE_ID = 'minecraft:player'

/**
 * What a clamped hit takes. Zero, and not a small survivable amount: a written-down hit reaches the
 * mob at the amount the handler wrote, so any non-zero constant kills a mob whose health is at or
 * below it — and a zombie converts a villager that dies that way. A constant rather than a figure
 * read off the mob, so the handler reads nothing about the subject while it runs.
 */
const CLAMPED_DAMAGE = 0

/** What the pack does with one hit. */
type Treatment =
  /** leave the hit alone — an unprotected mob, or an operator's deliberate removal */
  | 'pass'
  /** cancel it, so nothing lands and the mob does not react */
  | 'cancel'
  /** write the damage down to nothing and restore the mob to full health */
  | 'clamp'

const treat = (hurtTypeId: string, damageSource: EntityDamageSource): Treatment => {
  if (!protectedTypeIds.has(hurtTypeId) || OPERATOR_CAUSES.has(damageSource.cause)) {
    return 'pass'
  }
  // `damagingEntity` is the responsible entity rather than the projectile, so this covers a melee
  // swing and a loosed arrow alike.
  return damageSource.damagingEntity?.typeId === PLAYER_TYPE_ID ? 'cancel' : 'clamp'
}

/** The engine handles the pack runs against. */
export interface ProtectionHandles {
  readonly world: World
}

/**
 * Takes the pack's world-wide subscriptions. Called once, while the pack's script evaluates, so
 * the subscriptions stand before anything in the world can be hurt.
 *
 * A mob is protected because these subscriptions see its hit and by nothing else: the pack keeps
 * no registry, scans no dimension, and runs no periodic sweep.
 */
export const installProtection = ({ world }: ProtectionHandles): void => {
  world.beforeEvents.entityHurt.subscribe((event) => {
    switch (treat(event.hurtEntity.typeId, event.damageSource)) {
      case 'cancel':
        event.cancel = true
        break
      case 'clamp':
        event.damage = CLAMPED_DAMAGE
        break
      case 'pass':
        break
    }
  })

  // The clamp alone lets the losses accumulate until the mob dies anyway; the restore is what makes
  // it a protection. A cancelled hit raises no after-event, so nothing arrives here for one.
  world.afterEvents.entityHurt.subscribe((event) => {
    if (treat(event.hurtEntity.typeId, event.damageSource) !== 'clamp') {
      return
    }
    event.hurtEntity.getComponent('minecraft:health')?.resetToMaxValue()
  })
}
