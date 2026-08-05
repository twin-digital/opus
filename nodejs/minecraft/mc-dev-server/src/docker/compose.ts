import { execa } from 'execa'

import { CONTAINER_PORT, SERVICE_NAME } from '../server/layout.js'

/** What a compose invocation returned. */
export interface ComposeResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * The seam every Docker interaction passes through: one function that runs `docker compose` with
 * the arguments it is given. Tests drive the harness through a fake runner; nothing else in the
 * harness spawns a process against the daemon.
 */
export type ComposeRunner = (args: readonly string[]) => Promise<ComposeResult>

/**
 * The argv a compose invocation takes. The generated file is fully resolved and named by absolute
 * path, so neither `--project-directory` nor an env file is passed — the project name comes from
 * the file's own `name` key.
 */
export const composeArgv = (file: string, args: readonly string[]): string[] => ['compose', '-f', file, ...args]

/** Docker is not installed, or the daemon the environment selects is unreachable. */
export class DockerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DockerUnavailableError'
  }
}

/** A compose invocation that failed. */
export class ComposeError extends Error {
  constructor(
    message: string,
    readonly result: ComposeResult,
  ) {
    super(message)
    this.name = 'ComposeError'
  }
}

/**
 * A runner against the real `docker` command. The connection is whatever the environment already
 * selects — `DOCKER_HOST` or the active context — and the harness sets neither.
 */
export const createComposeRunner = (file: string): ComposeRunner => {
  return async (args) => {
    try {
      const result = await execa('docker', composeArgv(file, args), { reject: false, all: false })
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 }
    } catch (error) {
      throw new DockerUnavailableError(`docker could not be run: ${(error as Error).message}`)
    }
  }
}

/**
 * The streaming half of the seam: a long-running compose invocation whose output is delivered a
 * line at a time. `logs --follow` is the only thing the harness runs this way.
 */
export type ComposeFollower = (args: readonly string[], onLine: (line: string) => void) => LogFollow

/** A follower against the real `docker` command. */
export const createComposeFollower = (file: string): ComposeFollower => {
  return (args, onLine) => {
    const subprocess = execa('docker', composeArgv(file, args), { reject: false, all: true, buffer: false })
    let rest = ''
    subprocess.all.on('data', (chunk: Buffer | string) => {
      const text = rest + chunk.toString()
      const lines = text.split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) {
        onLine(line)
      }
    })
    return {
      stop: () => {
        subprocess.kill('SIGTERM')
        subprocess.all.destroy()
        subprocess.unref()
      },
    }
  }
}

/** How far back a reattach reads the container log looking for the world-load line. */
export const LOG_TAIL_LINES = 5000

/** What the running container reports about itself. */
export interface RunningContainer {
  image: string
  /** the host port published to the server's port, when one is */
  port?: number
}

/** A follow of the container log, until it is stopped. */
export interface LogFollow {
  stop(): void
}

/** Everything the harness does to a compose project. */
export interface ComposeClient {
  /** brings the project up, creating the volume if it is not there */
  up(): Promise<void>
  /** recreates the service container, keeping the volume */
  recreate(): Promise<void>
  /** takes the container down; `volumes` also removes the world volume */
  down(options?: { volumes?: boolean }): Promise<void>
  /** the running container, or `undefined` when the project is not up */
  running(): Promise<RunningContainer | undefined>
  /** runs a command inside the container with no TTY attached */
  exec(argv: readonly string[]): Promise<ComposeResult>
  /** copies a host path into the container */
  copyIn(hostPath: string, containerPath: string): Promise<void>
  /** copies a container path out to the host */
  copyOut(containerPath: string, hostPath: string): Promise<void>
  /** the last `tail` lines of the container log as it stands */
  logs(options?: { tail?: number }): Promise<string>
  /** follows the container log, replaying the last `tail` lines first */
  followLogs(onLine: (line: string) => void, options?: { tail?: number }): LogFollow
}

const service = SERVICE_NAME

const ok = (result: ComposeResult, what: string): ComposeResult => {
  if (result.exitCode !== 0) {
    throw new ComposeError(`${what} failed: ${result.stderr.trim() || result.stdout.trim()}`, result)
  }
  return result
}

/** Parses the `ps --format json` lines compose emits, one JSON object per container. */
export const parsePsOutput = (stdout: string): RunningContainer | undefined => {
  for (const line of stdout.split('\n')) {
    const text = line.trim()
    if (text === '') {
      continue
    }
    const row = JSON.parse(text) as {
      Image?: string
      State?: string
      Publishers?: { PublishedPort?: number; TargetPort?: number }[]
    }
    if (row.State !== 'running') {
      continue
    }
    const published = (row.Publishers ?? []).find((p) => p.TargetPort === CONTAINER_PORT)?.PublishedPort
    return { image: row.Image ?? '', ...(published === undefined ? {} : { port: published }) }
  }
  return undefined
}

/** The argv a log read takes. `--tail` bounds how far back a reattach looks for the world load. */
export const logsArgv = (tail: number, follow = false): string[] => [
  'logs',
  '--no-color',
  '--no-log-prefix',
  '--tail',
  String(tail),
  ...(follow ? ['--follow'] : []),
  service,
]

/** A client over a runner. Everything the harness does to the server goes through one of these. */
export const createComposeClient = (run: ComposeRunner, follow?: ComposeFollower): ComposeClient => ({
  up: async () => {
    ok(await run(['up', '--detach', '--no-recreate']), 'compose up')
  },
  recreate: async () => {
    ok(await run(['up', '--detach', '--force-recreate']), 'compose up --force-recreate')
  },
  down: async (options) => {
    ok(await run(['down', ...(options?.volumes === true ? ['--volumes'] : [])]), 'compose down')
  },
  running: async () => parsePsOutput(ok(await run(['ps', '--format', 'json']), 'compose ps').stdout),
  exec: async (argv) => run(['exec', '-T', service, ...argv]),
  copyIn: async (hostPath, containerPath) => {
    ok(await run(['cp', hostPath, `${service}:${containerPath}`]), 'compose cp')
  },
  copyOut: async (containerPath, hostPath) => {
    ok(await run(['cp', `${service}:${containerPath}`, hostPath]), 'compose cp')
  },
  logs: async (options) => ok(await run(logsArgv(options?.tail ?? LOG_TAIL_LINES)), 'compose logs').stdout,
  followLogs: (onLine, options) => {
    if (follow === undefined) {
      throw new Error('this compose client cannot follow logs')
    }
    return follow(logsArgv(options?.tail ?? LOG_TAIL_LINES, true), onLine)
  },
})
