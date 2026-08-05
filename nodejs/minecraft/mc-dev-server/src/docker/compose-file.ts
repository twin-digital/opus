import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { stringify } from 'yaml'

import { formatSeed } from '../seed.js'
import { CONTAINER_PORT, SERVICE_NAME, VOLUME_KEY } from '../server/layout.js'

/** Everything the generated project needs; nothing is left for compose to substitute. */
export interface ComposeProjectSpec {
  project: string
  image: string
  /** the host port published to the server */
  port: number
  /** the world the server serves; read only when it is generated */
  level: string
  /** the seed a generated world comes from */
  seed: bigint
}

/** The author has accepted neither on the command line nor in the config. */
export class EulaNotAcceptedError extends Error {
  constructor() {
    super(
      'the server EULA has not been accepted: pass --accept-eula or set `eula: true` in the config. ' +
        'https://www.minecraft.net/en-us/eula',
    )
    this.name = 'EulaNotAcceptedError'
  }
}

/**
 * Builds the generated compose project. Every value is already substituted, so the file compose
 * reads is the file the harness wrote.
 *
 * The server's posture is the harness's: offline mode, no allow list, the content log on the
 * console — without it a pack's script output never reaches the harness's stream — and resource
 * packs offered rather than required.
 */
export const composeProject = (spec: ComposeProjectSpec): Record<string, unknown> => ({
  name: spec.project,
  services: {
    [SERVICE_NAME]: {
      image: spec.image,
      stdin_open: true,
      tty: true,
      environment: {
        EULA: 'TRUE',
        LEVEL_NAME: spec.level,
        LEVEL_SEED: formatSeed(spec.seed),
        SERVER_PORT: String(CONTAINER_PORT),
        ONLINE_MODE: 'false',
        ALLOW_LIST: 'false',
        TEXTUREPACK_REQUIRED: 'false',
        CONTENT_LOG_CONSOLE_OUTPUT_ENABLED: 'true',
      },
      ports: [`${spec.port}:${CONTAINER_PORT}/udp`],
      stop_grace_period: '120s',
      volumes: [`${VOLUME_KEY}:/data`],
    },
  },
  volumes: { [VOLUME_KEY]: {} },
})

/** Renders the generated project as YAML. */
export const renderComposeFile = (spec: ComposeProjectSpec): string => stringify(composeProject(spec))

/**
 * Where the generated file is written: outside the author's workspace, keyed by project, and
 * rewritten on every invocation.
 */
export const composeFilePath = (project: string): string => join(tmpdir(), 'mc-dev-server', project, 'compose.yaml')

/** Writes the generated compose file and returns its absolute path. */
export const writeComposeFile = async (spec: ComposeProjectSpec): Promise<string> => {
  const path = composeFilePath(spec.project)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, renderComposeFile(spec), 'utf8')
  return path
}
