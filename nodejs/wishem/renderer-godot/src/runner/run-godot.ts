import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createDockerCli, ensureImage, type DockerCli } from './docker.ts'
import { startRelay } from './relay.ts'

const DEFAULT_HUB_PORT = 4749

const packageDir = join(import.meta.dirname, '..', '..')

export interface RunGodotOptions {
  /** Default 4749. */
  hubPort?: number
  /** Default `<package>/shots`. Emptied at the start. */
  shotsDir?: string
  log?: (line: string) => void
  docker?: DockerCli
}

export interface GodotRun {
  readonly container: string
  /** Resolves with the exit code of Godot. */
  readonly exited: Promise<number>
  /** Ends the relay and removes the container. Gives the same promise on each call. */
  close(): Promise<void>
}

const SHOT_LINE = /^wishem-godot: shot \d+ .* file (\/out\/[^/\s]+)$/

const emptyFolder = (dir: string) => {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true })
  }
}

const startRun = (options: RunGodotOptions): GodotRun => {
  const hubPort = options.hubPort ?? DEFAULT_HUB_PORT
  const shotsDir = options.shotsDir ?? join(packageDir, 'shots')
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })
  const docker = options.docker ?? createDockerCli()

  const tag = ensureImage(docker, join(packageDir, 'docker'), log)
  emptyFolder(shotsDir)

  const label = `wishem-godot=${createHash('sha1').update(`${hostname()}\0${packageDir}`).digest('hex').slice(0, 8)}`
  const container = `wishem-godot-${randomBytes(4).toString('hex')}`

  const old = (docker.run(['ps', '-aq', '--filter', `label=${label}`]) ?? '').split('\n').filter((id) => id !== '')
  if (old.length > 0) {
    docker.run(['rm', '--force', ...old])
  }

  const godotArgs = [
    'godot',
    '--rendering-driver',
    'opengl3',
    '--resolution',
    '640x360',
    '--path',
    '/srv/godot',
    '--',
    '--link',
    `ws://127.0.0.1:${String(hubPort)}/link`,
    '--shots',
    '/out',
  ]
  const script = 'godot --headless --path /srv/godot --import >/dev/null 2>&1; "$@"'
  const created = docker.run([
    'create',
    '--name',
    container,
    '--label',
    label,
    tag,
    'sh',
    '-c',
    script,
    'sh',
    'xvfb-run',
    '-a',
    '-s',
    '-screen 0 640x360x24',
    ...godotArgs,
  ])
  if (created === undefined) {
    throw new Error('The creation of the container failed.')
  }

  const remove = () => docker.run(['rm', '--force', container])
  let child: ReturnType<DockerCli['spawn']>
  let relay: ReturnType<typeof startRelay>
  try {
    if (docker.run(['cp', join(packageDir, 'godot'), `${container}:/srv/godot`]) === undefined) {
      throw new Error('The copy of the Godot project failed.')
    }
    child = docker.spawn(['start', '--attach', container])
    relay = startRelay({
      hubPort,
      spawnInner: () => docker.spawn(['exec', '-i', container, 'node', '/srv/relay.mjs', String(hubPort)]),
    })
  } catch (error) {
    remove()
    throw error
  }
  log(`wishem-godot: container ${container} started`)

  const exited = new Promise<number>((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? 1)
    })
  })

  const handleLine = (line: string) => {
    const shot = SHOT_LINE.exec(line)
    if (shot === null) {
      log(line)
      return
    }
    const remote = shot[1]
    const local = join(shotsDir, remote.slice('/out/'.length))
    docker.run(['cp', `${container}:${remote}`, local])
    log(line.slice(0, line.length - remote.length) + local)
  }
  for (const input of [child.stdout, child.stderr]) {
    const reader = createInterface({ input })
    reader.on('line', handleLine)
  }

  let closing: Promise<void> | undefined
  return {
    container,
    exited,
    close: () => {
      closing ??= (async () => {
        await relay.close()
        child.kill()
        remove()
      })()
      return closing
    },
  }
}

/** Starts the Godot application in a container, and carries the bytes of its link to the hub port of this computer. */
export const runGodot = (options: RunGodotOptions = {}): Promise<GodotRun> =>
  new Promise((resolve) => {
    resolve(startRun(options))
  })
