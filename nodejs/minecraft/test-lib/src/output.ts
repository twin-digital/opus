/**
 * What a fake would have sent: `player.sendMessage`, `world.sendMessage`, and `onScreenDisplay`'s
 * `setTitle`, `updateSubtitle` and `setActionBar` each append a record to their target's output
 * log rather than displaying anything.
 */

import type * as MC from '@minecraft/server'

import type { OutputRecord } from './runtime/state.js'

/** The messages and titles sent to a player or to the world, in the order they were sent. */
export const getOutput = (_target: MC.Player | MC.World): readonly OutputRecord[] => {
  throw new Error('output capture is not built yet')
}
