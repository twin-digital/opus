import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const GODOT_VERSION = '4.7.2'

export const DOCKER_REQUIRED_MESSAGE = 'wishem-godot: Docker is required. `docker info` failed.'

export interface ChildProcessLike {
  readonly stdin: NodeJS.WritableStream
  readonly stdout: NodeJS.ReadableStream
  kill(): void
  once(event: 'exit', listener: (code: number | null) => void): void
}

export interface DockerCli {
  /** Gives the output, or `undefined` when the command fails. */
  run(args: readonly string[]): string | undefined
  spawn(args: readonly string[]): ChildProcessLike
}

/** Runs the `docker` command of this computer. */
export const createDockerCli = (): DockerCli => ({
  run: (args) => {
    try {
      return execFileSync('docker', [...args], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', args[0] === 'build' ? 'inherit' : 'ignore'],
      })
    } catch {
      return undefined
    }
  },
  spawn: (args) => spawn('docker', [...args], { stdio: ['pipe', 'pipe', 'inherit'] }),
})

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort()

/** Gives the image tag: the Godot version and 12 hex digits of the SHA-256 of the files of `dockerDir`. */
export const imageTag = (dockerDir: string): string => {
  const hash = createHash('sha256')
  for (const file of listFiles(dockerDir)) {
    hash.update(`${file}\0`)
    hash.update(readFileSync(join(dockerDir, file)))
    hash.update('\0')
  }
  return `wishem-godot:${GODOT_VERSION}-${hash.digest('hex').slice(0, 12)}`
}

/** Builds the image when the daemon does not have it. Gives the tag. Throws when Docker fails. */
export const ensureImage = (docker: DockerCli, dockerDir: string, log: (line: string) => void): string => {
  if (docker.run(['info']) === undefined) {
    throw new Error(DOCKER_REQUIRED_MESSAGE)
  }
  const tag = imageTag(dockerDir)
  if (docker.run(['image', 'inspect', tag]) === undefined) {
    log(`wishem-godot: building image ${tag}`)
    if (docker.run(['build', '--tag', tag, dockerDir]) === undefined) {
      throw new Error('The build of the image failed.')
    }
  }
  log(`wishem-godot: image ${tag} is ready`)
  return tag
}
