/**
 * The example adventure's whole story: once the world has loaded, place every actor the product
 * offers in a gallery beside spawn — plus a greeter the story names itself — each under a durable
 * id, so a restart finds the actors already standing rather than placing a second gallery.
 *
 * Everything here is the adventure's own — where the gallery stands, when it is placed, what each
 * actor is called beyond its preset default, and what each failure says. No entity definition,
 * model, texture, animation, or preset default name appears in this package; the actors are the
 * product's.
 */

import type { System, Vector3, World } from '@minecraft/server'
import {
  findActor,
  ForeignEntityError,
  PRESET_NAMES,
  spawnActor,
  type ActorHandle,
  type ActorPlace,
  type PresetName,
  type SpawnActorOptions,
} from '@twin-digital/rpg-core'

/** The library calls the adventure drives; the library's own unless a test supplies them. */
export type SpawnFn = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions) => ActorHandle
export type FindFn = (id: string) => ActorHandle | undefined

/**
 * Where the gallery starts, matching the dev world's spawn in `.minecraft.yml`. One block above
 * the ground surface: actors are subject to gravity and settle onto it.
 */
export const STAGE = { x: 465, y: 70, z: -64 } as const

/** Blocks between one actor and the next along the gallery's line. */
export const SPACING = 3

/** Ticks between placement attempts, and attempts before a placement is given up loudly. */
export const PLACEMENT_TICKS = 20
export const PLACEMENT_ATTEMPTS = 15

/**
 * The durable id an actor is placed under — the adventure's own name for it, stable across
 * restarts, so re-running the story returns the actors already in the world. A durable id holds
 * no `:`; the library keys the world record on the adventure's namespace itself.
 */
export const durableId = (preset: PresetName): string => `gallery.${preset}`

/** One actor the story places: who, where, and under what durable id. */
export interface Placement {
  /** How messages name this actor; distinct per placement. */
  readonly key: string
  readonly preset: PresetName
  readonly location: Vector3
  readonly options: SpawnActorOptions
}

/**
 * Everything the story places. The gallery holds one actor per preset under its default name;
 * the greeter is the story's own character — the same wizard preset, under a name the adventure
 * chose — standing at the stage where a player arrives.
 */
export const placements = (): Placement[] => [
  {
    key: 'greeter',
    preset: 'wizard',
    location: { ...STAGE },
    options: { id: 'greeter', name: 'Eldrin the Greeter' },
  },
  ...PRESET_NAMES.map((preset, index) => ({
    key: preset,
    preset,
    // the clear ground runs north of the stage: the line extends toward decreasing z
    location: { x: STAGE.x, y: STAGE.y, z: STAGE.z - SPACING * (index + 1) },
    options: { id: durableId(preset) },
  })),
]

/** What the adventure needs from its host; the library calls default to the real ones. */
export interface AdventureHandles {
  readonly world: World
  readonly system: System
  readonly spawn?: SpawnFn
  readonly find?: FindFn
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const say = (world: World, text: string): void => {
  world.sendMessage(`[rpg-core-example] ${text}`)
}

/**
 * Keeps the stage's chunks loaded so placement does not depend on a player standing nearby.
 * Best-effort: the area may already exist from an earlier run, and a test world has no commands.
 */
const prepareStage = (world: World): void => {
  const zNorth = STAGE.z - SPACING * (PRESET_NAMES.length + 1) - 2
  try {
    world
      .getDimension('overworld')
      .runCommand(
        `tickingarea add ${STAGE.x - 2} ${STAGE.y} ${zNorth} ${STAGE.x + 2} ${STAGE.y} ${STAGE.z + 2} rpg-core-example-stage`,
      )
  } catch {
    // an existing area of the same name, or a world without commands — placement retries cover it
  }
}

/**
 * Attempts every placement still pending, in place. A success settles a placement, and so does a
 * `ForeignEntityError`, which a retry cannot clear: another pack's content answers the identifier.
 * Any other failure — typically chunks that have not finished loading — leaves the placement for
 * the next attempt.
 */
const attemptPlacements = (world: World, spawn: SpawnFn, pending: Map<string, Placement>): void => {
  for (const placement of [...pending.values()]) {
    try {
      spawn(
        placement.preset,
        { dimension: world.getDimension('overworld'), location: placement.location },
        placement.options,
      )
      pending.delete(placement.key)
    } catch (error) {
      if (error instanceof ForeignEntityError) {
        say(world, `could not place '${placement.key}': ${error.message}`)
        pending.delete(placement.key)
      }
      // otherwise: retry on the next attempt
    }
  }
}

/** Reports how the story ended: each actor standing under its name, or missing, or given up. */
const reportGallery = (world: World, find: FindFn, pending: Map<string, Placement>): void => {
  for (const placement of placements()) {
    if (pending.has(placement.key)) {
      say(world, `gave up placing '${placement.key}' after ${PLACEMENT_ATTEMPTS} attempts`)
      continue
    }
    try {
      const actor = placement.options.id === undefined ? undefined : find(placement.options.id)
      if (actor !== undefined) {
        say(world, `'${placement.key}' stands as '${actor.entity.nameTag}'`)
      }
    } catch (error) {
      say(world, `could not look up '${placement.key}': ${messageOf(error)}`)
    }
  }
}

/**
 * Wires the story to the world: placement begins when the world loads — never earlier; only
 * subscribing is allowed during script startup — and repeats each second until every actor
 * stands or is accounted for.
 */
export const installAdventure = (handles: AdventureHandles): void => {
  const { world, system, spawn = spawnActor, find = findActor } = handles

  world.afterEvents.worldLoad.subscribe(() => {
    prepareStage(world)
    const pending = new Map(placements().map((placement) => [placement.key, placement]))
    let attempts = 0

    const timer = system.runInterval(() => {
      attempts += 1
      attemptPlacements(world, spawn, pending)
      if (pending.size === 0 || attempts >= PLACEMENT_ATTEMPTS) {
        system.clearRun(timer)
        reportGallery(world, find, pending)
      }
    }, PLACEMENT_TICKS)
  })
}
