import type { PackKind } from '@twin-digital/mc-dev-kit'

/** The volume mount point: everything the harness reads or writes on the server sits under it. */
export const DATA_ROOT = '/data'

/** The server's own configuration file, which names the world it is serving. */
export const SERVER_PROPERTIES = `${DATA_ROOT}/server.properties`

/** The harness's own directory on the volume — nothing the server reads. */
export const HARNESS_DIR = `${DATA_ROOT}/.mc-dev-server`

/** The record of which seed generated which world. */
export const WORLDS_RECORD = `${HARNESS_DIR}/worlds.json`

/** The compose service, volume key, and mount the generated project uses. */
export const SERVICE_NAME = 'bedrock'
export const VOLUME_KEY = 'world-data'
/** the port the server listens on inside the container; the published port is the run's */
export const CONTAINER_PORT = 19132

/** The pool a pack of each kind occupies. */
export const poolDir = (kind: PackKind): string =>
  kind === 'behavior' ? `${DATA_ROOT}/development_behavior_packs` : `${DATA_ROOT}/development_resource_packs`

/** A pack occupies a directory named for its header uuid, lowercased. */
export const packDir = (kind: PackKind, uuid: string): string => `${poolDir(kind)}/${uuid.toLowerCase()}`

/** The world a level name names. */
export const worldDir = (level: string): string => `${DATA_ROOT}/worlds/${level}`

/** The world's activation list for a pack kind. */
export const activationFile = (level: string, kind: PackKind): string =>
  `${worldDir(level)}/${kind === 'behavior' ? 'world_behavior_packs.json' : 'world_resource_packs.json'}`
