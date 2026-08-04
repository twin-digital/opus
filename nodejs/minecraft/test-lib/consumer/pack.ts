/**
 * A stand-in for an unmodified behavior pack: it imports values from `@minecraft/server` — an enum
 * member and a class for an `instanceof` — subscribes at module scope, and registers a scheduled
 * loop, all while it evaluates. Nothing here knows about the fakes.
 */

import { EntityDamageCause, Player, system, world } from '@minecraft/server'

export const hurtLog: string[] = []
export let ticks = 0

world.afterEvents.entityHurt.subscribe((event) => {
  const cause = event.damageSource.cause
  const who = event.hurtEntity instanceof Player ? 'player' : 'entity'
  hurtLog.push(`${who}:${cause === EntityDamageCause.entityAttack ? 'attack' : cause}`)
})

system.runInterval(() => {
  ticks += 1
}, 1)
