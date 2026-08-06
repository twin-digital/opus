/** Where a joining player arrives. */
export type Spawn = readonly [number, number, number]

/** The world settings a config level or a profile may carry. */
export interface WorldSettings {
  level?: string
  /** exact, so a 64-bit seed survives a JSON round trip */
  seed?: bigint
  spawn?: Spawn
}

/** A saved selection: which packs a run hosts, and the world it hosts them against. */
export interface Profile extends WorldSettings {
  /** owning package names; absent hosts every pack, empty hosts none */
  packs?: readonly string[]
}

/** `.minecraft.yaml` as the harness understands it, every key optional. */
export interface WorkspaceConfig extends WorldSettings {
  version?: '1'
  image?: string
  port?: number
  eula?: boolean
  profiles?: Readonly<Record<string, Profile>>
  defaultProfile?: string
}

/** A config file the harness loaded, and where it came from. */
export interface LoadedConfig {
  /** the absolute path the config was read from, or `undefined` when no file applied */
  path?: string
  config: WorkspaceConfig
}
