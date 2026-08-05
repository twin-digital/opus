import { DEFAULT_LEVEL } from '../settings/resolve.js'

/** What this run asks of the server. An absent `level` or `seed` matches anything. */
export interface DesiredServer {
  level?: string
  seed?: bigint
  image: string
  port: number
}

/** What the running server is, read off the server itself rather than any record of it. */
export interface RunningServer {
  /** the level name in the server's configuration on the volume */
  level: string
  image: string
  /** the published host port, where one is */
  port?: number
  /** the level names the volume holds worlds for */
  worlds: readonly string[]
  /** the seed each world the harness generated came from */
  seeds: Readonly<Record<string, bigint>>
}

/** What start does, given what is already running. */
export type StartAction =
  /** nothing is running: bring the project up on this world */
  | { kind: 'start'; level: string; generate: boolean }
  /** every specified setting matches */
  | { kind: 'attach' }
  /** recreate the container; the volume and every world on it survive, connected clients do not */
  | { kind: 'recreate'; level: string; generate: boolean; reason: string }
  /** the only destructive rung: the world must be regenerated, and the author has to agree */
  | { kind: 'confirm-regenerate'; level: string; requestedSeed: bigint; recordedSeed?: bigint }

/** The world a run serves when nothing names one. */
export const levelFor = (desired: DesiredServer, running?: RunningServer): string =>
  desired.level ?? running?.level ?? DEFAULT_LEVEL

/**
 * The ladder start walks when a server is already running. Only what a reconcile cannot fix is
 * compared: pack selection is the reconcile's job and the spawn point is set on a live world.
 */
export const decideStartAction = (desired: DesiredServer, running?: RunningServer): StartAction => {
  if (running === undefined) {
    const level = desired.level ?? DEFAULT_LEVEL
    return { kind: 'start', level, generate: true }
  }

  const level = levelFor(desired, running)

  if (desired.level !== undefined && desired.level !== running.level) {
    const held = running.worlds.includes(desired.level)
    return {
      kind: 'recreate',
      level: desired.level,
      generate: !held,
      reason:
        held ?
          `switching to the world '${desired.level}' the volume already holds`
        : `generating the world '${desired.level}'`,
    }
  }

  const requestedSeed = desired.seed
  const recordedSeed: bigint | undefined = Object.hasOwn(running.seeds, level) ? running.seeds[level] : undefined
  const seedMatches = requestedSeed === undefined || recordedSeed === requestedSeed

  if (
    seedMatches &&
    (desired.image !== running.image || (running.port !== undefined && desired.port !== running.port))
  ) {
    return {
      kind: 'recreate',
      level,
      generate: false,
      reason:
        desired.image !== running.image ?
          `the image changed to ${desired.image}`
        : `the published port changed to ${desired.port}`,
    }
  }

  if (requestedSeed !== undefined && !seedMatches) {
    return {
      kind: 'confirm-regenerate',
      level,
      requestedSeed,
      ...(recordedSeed === undefined ? {} : { recordedSeed }),
    }
  }

  return { kind: 'attach' }
}
