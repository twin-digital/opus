/**
 * What a fake would have sent: `player.sendMessage`, `world.sendMessage`, and `onScreenDisplay`'s
 * `setTitle`, `updateSubtitle` and `setActionBar` each append a record to their target's output
 * log rather than displaying anything.
 */

import type * as MC from '@minecraft/server'

import { construct } from './runtime/construct.js'
import { isValidFake, registerBehaviour, stateOf } from './runtime/member.js'
import { dataOf, serverOf, type EntityData, type OutputRecord, type ServerState } from './runtime/state.js'

/** The state behind a player's `ScreenDisplay`, whose validity follows the player's. */
interface ScreenDisplayData {
  readonly server: ServerState
  readonly entity: EntityData
}

/** What a member sends, as passed. */
type Sendable = (MC.RawMessage | string)[] | MC.RawMessage | string

/** Appends one record; `options` is absent rather than undefined where the member carried none. */
const capture = (
  log: OutputRecord[],
  kind: OutputRecord['kind'],
  value: Sendable,
  options?: MC.TitleDisplayOptions,
): void => {
  log.push(options === undefined ? { kind, value } : { kind, value, options })
}

/** The log a fake's output goes to: the world's own, or the player it was sent to. */
const logOf = (fake: object): OutputRecord[] =>
  stateOf(fake).className === 'World' ? serverOf(fake).output : dataOf<EntityData>(fake).output

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

const sendMessage = (fake: object, message: Sendable): void => {
  capture(logOf(fake), 'message', message)
}

registerBehaviour('World', { sendMessage })

registerBehaviour('Player', {
  sendMessage,
  onScreenDisplay: (fake: object) => {
    const data = dataOf<EntityData>(fake)
    return (data.screenDisplay ??= construct('ScreenDisplay', {
      data: { server: data.server, entity: data } satisfies ScreenDisplayData,
      owner: stateOf(fake),
    }) as MC.ScreenDisplay)
  },
})

registerBehaviour('ScreenDisplay', {
  isValid: (fake: object) => isValidFake(stateOf(fake)),
  setTitle: (fake: object, title: Sendable, options?: MC.TitleDisplayOptions) => {
    capture(dataOf<ScreenDisplayData>(fake).entity.output, 'title', title, options)
  },
  updateSubtitle: (fake: object, subtitle: Sendable) => {
    capture(dataOf<ScreenDisplayData>(fake).entity.output, 'subtitle', subtitle)
  },
  setActionBar: (fake: object, text: Sendable) => {
    capture(dataOf<ScreenDisplayData>(fake).entity.output, 'actionBar', text)
  },
})

// ---------------------------------------------------------------------------
// Free functions
// ---------------------------------------------------------------------------

/**
 * The messages and titles sent to a player or to the world, in the order they were sent. The array
 * is a snapshot: sending again does not grow one a test is already holding.
 */
export const getOutput = (target: MC.Player | MC.World): readonly OutputRecord[] => [...logOf(target)]
