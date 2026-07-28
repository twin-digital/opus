/**
 * The per-instance state every behaving member reads and writes. All of it hangs off one
 * `ServerState`, which `createServer` makes and nothing else shares: two bundles in one process
 * have nothing in common, so a test needs no reset hook.
 */

import type * as minecraftcommon from '@minecraft/common'
import type * as MC from '@minecraft/server'

import { stateOf } from './member.js'

/** A message or title a fake would have sent, captured instead of displayed. */
export interface OutputRecord {
  readonly kind: 'message' | 'title' | 'subtitle' | 'actionBar'
  readonly value: (string | MC.RawMessage)[] | string | MC.RawMessage
  readonly options?: MC.TitleDisplayOptions
}

/** An error a subscriber threw, which the dispatch absorbed as the engine does. */
export interface HandlerError {
  /** The signal whose subscriber threw, fully qualified — `world.afterEvents.entityHurt`. */
  readonly signal: string
  readonly error: unknown
}

/** Which family of signals a key belongs to. The world and `system` each carry both. */
export type SignalScope = 'world.afterEvents' | 'world.beforeEvents' | 'system.afterEvents' | 'system.beforeEvents'

/** One signal's subscribers, in subscription order and deduplicated by reference. */
export interface SignalState {
  readonly scope: SignalScope
  readonly name: string
  readonly subscribers: Set<(payload: never) => void>
  /** The signal object the container hands out — the one a test passes to `emit`. */
  fake: object
}

/** A callback `system` is holding until the test advances the tick it is due on. */
export interface ScheduledRun {
  readonly handle: number
  readonly kind: 'run' | 'timeout' | 'interval'
  /** The tick this callback next runs on. An interval moves it forward after each run. */
  dueTick: number
  readonly interval: number
  readonly callback: () => void
  cancelled: boolean
}

/** The value types a dynamic property can hold, as the declarations give them. */
export type DynamicPropertyValue = boolean | number | string | MC.Vector3

/** One scoreboard objective and the scores it holds per participant. */
export interface ObjectiveState {
  readonly id: string
  /** Optional in the declarations, so an objective added without one has none to read. */
  readonly displayName?: string
  readonly objective: MC.ScoreboardObjective
  /** Keyed by participant identity — an entity's scoreboard id, or a fake-player name. */
  readonly scores: Map<string, number>
  readonly participants: Map<string, MC.ScoreboardIdentity>
}

/** The scoreboard's own state: its objectives, and which one each display slot shows. */
export interface ScoreboardState {
  readonly objectives: Map<string, ObjectiveState>
  readonly displaySlots: Map<MC.DisplaySlotId, { objective: MC.ScoreboardObjective; sortOrder?: MC.ObjectiveSortOrder }>
  /** Every participant identity the bundle has issued, keyed as the objectives key their scores. */
  identities?: Map<string, MC.ScoreboardIdentity>
  /** The next identity id to issue; the engine's are numbers with no promised spelling. */
  nextIdentityId?: number
}

/** A component attached to an entity: the fake the test sees, and the values it holds. */
export interface ComponentState {
  readonly componentId: string
  readonly component: MC.EntityComponent
  /** The four attribute numbers, each unset until a caller supplies it. */
  readonly attribute?: AttributeValues
  attached: boolean
}

/** The numbers an attribute-shaped component holds. An unsupplied one reads `UnsetValueError`. */
export interface AttributeValues {
  currentValue?: number
  defaultValue?: number
  effectiveMin?: number
  effectiveMax?: number
}

/** An effect an entity carries. Its duration is the number applied, and never decays. */
export interface EffectState {
  readonly typeId: string
  readonly effect: MC.Effect
  amplifier: number
  duration: number
  /** Cleared when the effect is removed or replaced, which is what turns its fake invalid. */
  present: boolean
}

/** Everything one fake entity holds. A player carries the same record plus `name`. */
export interface EntityData {
  readonly server: ServerState
  readonly entity: MC.Entity
  readonly typeId: string
  readonly id: string
  readonly isPlayer: boolean
  /** Fields the engine could not lack: unset until supplied, and a read of one then throws. */
  dimension?: MC.Dimension
  location?: MC.Vector3
  nameTag?: string
  rotation?: MC.Vector2
  velocity?: MC.Vector3
  name?: string
  readonly tags: Set<string>
  readonly components: Map<string, ComponentState>
  readonly effects: Map<string, EffectState>
  readonly dynamicProperties: Map<string, DynamicPropertyValue>
  readonly triggeredEvents: string[]
  readonly output: OutputRecord[]
  scoreboardIdentity?: MC.ScoreboardIdentity
  /** Built on first read of `onScreenDisplay`, so a player hands out one display object. */
  screenDisplay?: MC.ScreenDisplay
  /** False once `remove()` has detached the entity from the world. */
  registered: boolean
}

/** A dimension registered on the world, and the ids `world.getDimension` answers to for it. */
export interface DimensionData {
  readonly server: ServerState
  readonly id: string
  readonly heightRange: minecraftcommon.NumberRange
  readonly localizationKey: string
}

/** One bundle's whole world: everything `createServer` made and everything a test has done to it. */
export interface ServerState {
  /** Assigned as the bundle is built: the world and `system` need the state they belong to. */
  world: MC.World
  system: MC.System
  /** Every entity ever registered, in creation order; `remove()` clears its `registered` flag. */
  readonly entities: EntityData[]
  nextEntityId: number
  /** Every id a dimension answers to — prefixed, bare and aliased — mapped to that dimension. */
  readonly dimensions: Map<string, MC.Dimension>
  readonly signals: Map<string, SignalState>
  readonly handlerErrors: HandlerError[]
  currentTick: number
  nextRunHandle: number
  readonly scheduled: ScheduledRun[]
  /** Base display names registered for effect types, over the shipped vanilla table. */
  readonly effectBaseNames: Map<string, string>
  readonly dynamicProperties: Map<string, DynamicPropertyValue>
  readonly scoreboard: ScoreboardState
  readonly output: OutputRecord[]
}

/**
 * The state record behind a fake, typed as the data the class that made it keeps. The caller names
 * that type: the fake's own declaration cannot, since every class shares one state shape.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- D is the caller's claim about the data, not an inference
export const dataOf = <D>(fake: object): D => stateOf<D>(fake).data

/** The entity behind an entity or player fake. */
export const entityDataOf = (entity: MC.Entity): EntityData => dataOf<EntityData>(entity)

/** The bundle a fake belongs to, whatever kind of fake it is. */
export const serverOf = (fake: object): ServerState => dataOf<{ server: ServerState }>(fake).server
