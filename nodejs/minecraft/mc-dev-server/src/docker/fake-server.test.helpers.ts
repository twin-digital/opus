/**
 * A fake Bedrock server behind the compose seam.
 *
 * It holds the volume in memory, answers the shell reads the harness makes, applies `cp`, and
 * emits the world-load line a world load emits — reading the activation list to decide what the
 * load brought up, exactly as the real server does. That is enough for the whole loop to be driven
 * without a daemon; what it cannot stand in for is the server's own behaviour, which the
 * manual checks cover.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { parseActivation } from '../server/state.js'
import { SERVICE_NAME } from '../server/layout.js'

import type { ComposeClient, ComposeResult, LogFollow, RunningContainer } from './compose.js'

/** The in-memory volume: a file's content by absolute container path, plus the directories held. */
export interface Volume {
  files: Map<string, string>
  dirs: Set<string>
}

export interface FakeServer extends ComposeClient {
  /** every compose operation the harness performed, in order */
  readonly operations: string[]
  /** the volume as it stands */
  readonly volume: Volume
  /** whether the container is up */
  isRunning(): boolean
  /** puts a file on the volume without the harness's help, as a hand edit would */
  put(path: string, content: string): void
  /** the files the volume holds under a prefix */
  under(prefix: string): string[]
  /** the world the generated project names; the harness sets it by rewriting the compose file */
  setLevel(level: string): void
  /** fails the next shell read, as an unreachable container would */
  failReadsOnce(): void
  /** how long the fake takes over each operation, so a test can overlap two reconciles */
  latencyMs: number
}

const dirsOf = (path: string): string[] => {
  const parts = path.split('/').filter((part) => part !== '')
  return parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`)
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const tailOf = (lines: readonly string[], tail: number | undefined): string[] =>
  tail === undefined ? [...lines]
  : tail <= 0 ? []
  : lines.slice(-tail)

const ok = (stdout = ''): ComposeResult => ({ stdout, stderr: '', exitCode: 0 })

/** Copies a host path — a file or a whole tree — onto the volume at `destination`. */
const copyTree = async (volume: Volume, hostPath: string, destination: string): Promise<void> => {
  const info = await stat(hostPath)
  if (info.isFile()) {
    for (const dir of dirsOf(destination).slice(0, -1)) {
      volume.dirs.add(dir)
    }
    volume.files.set(destination, await readFile(hostPath, 'utf8'))
    return
  }
  for (const dir of dirsOf(destination)) {
    volume.dirs.add(dir)
  }
  for (const entry of await readdir(hostPath, { recursive: true, withFileTypes: true })) {
    const absolute = join(entry.parentPath, entry.name)
    const target = `${destination}/${relative(hostPath, absolute).split(sep).join('/')}`
    if (entry.isDirectory()) {
      volume.dirs.add(target)
    } else if (entry.isFile()) {
      volume.files.set(target, await readFile(absolute, 'utf8'))
    }
  }
}

/**
 * The small shell the fake understands: the `echo`, `find` and `cat` lines the harness's own reads
 * are built from, and nothing else. Running the harness's real scripts through it is what keeps
 * the reads under test rather than mocked.
 */
const runScript = (volume: Volume, script: string): string => {
  const out: string[] = []
  for (const line of script.split('\n')) {
    const echo = /^echo '(.*)'$/.exec(line)
    if (echo !== null) {
      out.push(echo[1])
      continue
    }
    const find = /^find '(.*?)' -mindepth (\d+)(?: -maxdepth \d+)? -type ([df])/.exec(line)
    if (find !== null) {
      const [, root, min, type] = find
      const maxMatch = /-maxdepth (\d+)/.exec(line)
      const limit = maxMatch === null ? Number.POSITIVE_INFINITY : Number(maxMatch[1])
      const depth = (path: string): number =>
        path
          .slice(root.length)
          .split('/')
          .filter((p) => p !== '').length
      const candidates = type === 'd' ? [...volume.dirs] : [...volume.files.keys()]
      for (const path of candidates.sort()) {
        if (!path.startsWith(`${root}/`)) {
          continue
        }
        const d = depth(path)
        if (d >= Number(min) && d <= limit) {
          out.push(path)
        }
      }
      continue
    }
    const cat = /^cat '(.*?)'/.exec(line)
    if (cat !== null) {
      const held = volume.files.get(cat[1])
      if (held !== undefined) {
        out.push(...held.split('\n').slice(0, held.endsWith('\n') ? -1 : undefined))
      }
      continue
    }
    throw new Error(`the fake server's shell does not know: ${line}`)
  }
  return out.join('\n')
}

/** The world-load line a load emits, naming what the activation list actually brought up. */
export const packStackLineFor = (activation: readonly { pack_id: string }[]): string => {
  const stamp = '[2026-08-05 00:00:00:000 INFO]'
  if (activation.length === 0) {
    return `${stamp} Pack Stack - None`
  }
  return `${stamp} Pack Stack - ${activation
    .map((entry, index) => `[0${String(index)}] pack (id: ${entry.pack_id}, version: 1.0.0)`)
    .join(' ')}`
}

/** A fake server for one generated project. */
export const createFakeServer = (spec: { image: string; port: number; level: string }): FakeServer => {
  const volume: Volume = { files: new Map(), dirs: new Set(['/data']) }
  const operations: string[] = []
  const log: string[] = []
  const followers = new Set<(line: string) => void>()
  let running = false
  let level = spec.level
  let failRead = false
  let loadTimer: NodeJS.Timeout | undefined

  const emit = (line: string): void => {
    log.push(line)
    for (const follower of followers) {
      follower(line)
    }
  }

  const loadWorld = (): void => {
    volume.dirs.add(`/data/worlds/${level}`)
    volume.files.set('/data/server.properties', `level-name=${level}\n`)
    const activation = parseActivation(volume.files.get(`/data/worlds/${level}/world_behavior_packs.json`) ?? '')
    emit(`[2026-08-05 00:00:00:000 INFO] Server started.`)
    emit(packStackLineFor(activation))
  }

  const bringUp = (): void => {
    running = true
    clearTimeout(loadTimer)
    loadTimer = setTimeout(loadWorld, 5)
  }

  const server: FakeServer = {
    latencyMs: 0,
    operations,
    volume,
    isRunning: () => running,
    setLevel: (next) => {
      level = next
    },
    put: (path, content) => {
      for (const dir of dirsOf(path).slice(0, -1)) {
        volume.dirs.add(dir)
      }
      volume.files.set(path, content)
    },
    under: (prefix) => [...volume.files.keys()].filter((path) => path.startsWith(prefix)).sort(),
    failReadsOnce: () => {
      failRead = true
    },

    up: async () => {
      operations.push('up')
      await delay(server.latencyMs)
      if (!running) {
        bringUp()
      }
    },
    recreate: async () => {
      operations.push('recreate')
      await delay(server.latencyMs)
      bringUp()
    },
    down: async (options) => {
      operations.push(options?.volumes === true ? 'down --volumes' : 'down')
      running = false
      clearTimeout(loadTimer)
      if (options?.volumes === true) {
        volume.files.clear()
        volume.dirs.clear()
        volume.dirs.add('/data')
      }
      await delay(server.latencyMs)
    },
    running: async (): Promise<RunningContainer | undefined> => {
      await delay(server.latencyMs)
      return running ? { image: spec.image, port: spec.port } : undefined
    },
    exec: async (argv) => {
      await delay(server.latencyMs)
      const [head, ...rest] = argv
      if (head === 'sh' && rest[0] === '-c') {
        operations.push('read')
        if (failRead) {
          failRead = false
          throw new Error('the container is not there')
        }
        return ok(runScript(volume, rest[1]))
      }
      if (head === 'send-command') {
        operations.push(`console ${rest.join(' ')}`)
        if (rest[0] === 'stop') {
          running = false
          clearTimeout(loadTimer)
        }
        return ok('')
      }
      if (head === 'rm') {
        const target = argv[argv.length - 1]
        operations.push(`rm ${target}`)
        for (const path of [...volume.files.keys()]) {
          if (path === target || path.startsWith(`${target}/`)) {
            volume.files.delete(path)
          }
        }
        for (const dir of [...volume.dirs]) {
          if (dir === target || dir.startsWith(`${target}/`)) {
            volume.dirs.delete(dir)
          }
        }
        return ok()
      }
      if (head === 'mkdir') {
        const target = argv[argv.length - 1]
        operations.push(`mkdir ${target}`)
        for (const dir of dirsOf(target)) {
          volume.dirs.add(dir)
        }
        return ok()
      }
      if (head === 'cat') {
        const held = volume.files.get(argv[1])
        return held === undefined ? { stdout: '', stderr: 'no such file', exitCode: 1 } : ok(held)
      }
      throw new Error(`the fake server does not know: ${argv.join(' ')}`)
    },
    copyIn: async (hostPath, containerPath) => {
      operations.push(`cp ${containerPath}`)
      await delay(server.latencyMs)
      await copyTree(volume, hostPath, containerPath)
    },
    copyOut: () => Promise.reject(new Error('the fake server copies nothing out')),
    logs: (options) => Promise.resolve(tailOf(log, options?.tail).join('\n')),
    followLogs: (onLine, options): LogFollow => {
      for (const line of tailOf(log, options?.tail ?? 0)) {
        onLine(line)
      }
      followers.add(onLine)
      return {
        stop: () => {
          followers.delete(onLine)
        },
      }
    },
  }

  return server
}

/** The service name the fake stands in for, so a test can assert what the real client would say. */
export const FAKE_SERVICE = SERVICE_NAME
