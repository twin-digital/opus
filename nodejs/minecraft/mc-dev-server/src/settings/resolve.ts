import type { Profile, Spawn, WorkspaceConfig } from '../config/types.js'
import type { PackEntry } from '@twin-digital/mc-dev-kit'

/** The image the harness pins; only its tag is a run's to change. */
export const DEFAULT_IMAGE_REPOSITORY = 'itzg/minecraft-bedrock-server'
export const DEFAULT_IMAGE_TAG = 'latest'
export const DEFAULT_IMAGE = `${DEFAULT_IMAGE_REPOSITORY}:${DEFAULT_IMAGE_TAG}`
export const DEFAULT_PORT = 19132
/** the world a run generates when nothing names one */
export const DEFAULT_LEVEL = 'default'

/** What the command line supplied for this run. */
export interface CommandLineSettings {
  profile?: string
  level?: string
  seed?: bigint
  spawn?: Spawn
  image?: string
  port?: number
  acceptEula?: boolean
}

/**
 * The settings a run carries once the four layers are folded together.
 *
 * `level`, `seed` and `spawn` stay optional: an unspecified one is a wildcard when start compares
 * against a running server, and takes its default only where a world has to be generated.
 * `image`, `port` and `eula` always have a value.
 */
export interface RunSettings {
  level?: string
  seed?: bigint
  spawn?: Spawn
  image: string
  port: number
  eula: boolean
  /** the profile that applied, if any */
  profile?: string
  /** owning package names the run hosts; `undefined` hosts every discovered pack */
  packs?: readonly string[]
}

/** A selection the config or the command line asked for that the run cannot honour. */
export class SelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectionError'
  }
}

const pickProfile = (config: WorkspaceConfig, named?: string): { name?: string; profile?: Profile } => {
  const profiles = config.profiles ?? {}
  const name = named ?? config.defaultProfile
  if (name === undefined) {
    return {}
  }
  if (!Object.hasOwn(profiles, name)) {
    throw new SelectionError(`no profile named '${name}' in the config`)
  }
  return { name, profile: profiles[name] }
}

/**
 * Folds the harness's defaults, the config's top level, the selected profile, and the command line
 * in that order, the later overriding the earlier.
 */
export const resolveSettings = (config: WorkspaceConfig, cli: CommandLineSettings = {}): RunSettings => {
  const { name, profile } = pickProfile(config, cli.profile)

  const level = cli.level ?? profile?.level ?? config.level
  const seed = cli.seed ?? profile?.seed ?? config.seed
  const spawn = cli.spawn ?? profile?.spawn ?? config.spawn

  return {
    ...(level === undefined ? {} : { level }),
    ...(seed === undefined ? {} : { seed }),
    ...(spawn === undefined ? {} : { spawn }),
    image: cli.image ?? config.image ?? DEFAULT_IMAGE,
    port: cli.port ?? config.port ?? DEFAULT_PORT,
    eula: cli.acceptEula === true || config.eula === true,
    ...(name === undefined ? {} : { profile: name }),
    ...(profile?.packs === undefined ? {} : { packs: profile.packs }),
  }
}

/**
 * Narrows a discovered pack set to what the run hosts. A selection naming a package the workspace
 * does not hold is an error; no selection hosts everything.
 */
export const selectPacks = (entries: readonly PackEntry[], packs?: readonly string[]): readonly PackEntry[] => {
  if (packs === undefined) {
    return entries
  }
  const wanted = new Set(packs)
  const held = new Set(entries.map((entry) => entry.packageName))
  const missing = [...wanted].filter((name) => !held.has(name))
  if (missing.length > 0) {
    throw new SelectionError(`the workspace holds no package named ${missing.join(', ')}`)
  }
  return entries.filter((entry) => wanted.has(entry.packageName))
}
