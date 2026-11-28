import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { godotLabel } from '@thrashplay/wishem-renderer-godot'
import { PNG } from 'pngjs'

export const PACKAGE_DIR = join(import.meta.dirname, '..')
export const PIXI_PAGE_DIR = join(PACKAGE_DIR, '..', 'pixi-page')
export const GODOT_DIR = join(PACKAGE_DIR, '..', 'renderer-godot')
export const WORKBENCH_DIR = join(PACKAGE_DIR, '..', 'workbench-app')
export const START_MS = 60_000
export const POLL_MS = 5000

export interface Child {
  process: ChildProcess
  lines: string[]
  exited: Promise<number | null>
}

export interface Shot {
  seq: number
  file: string
}

export interface Renderer {
  name: string
  /** The PNG of the current picture. */
  picture(): Promise<Buffer>
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const waitFor = async <T>(what: string, find: () => T | undefined | Promise<T | undefined>, ms: number) => {
  const deadline = Date.now() + ms
  for (;;) {
    const found = await find()
    if (found !== undefined) {
      return found
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout while waiting for: ${what}`)
    }
    await sleep(50)
  }
}

/** Waits until the page server answers a GET with status 200. */
export const waitForPage = (url: string) =>
  waitFor(
    `the page server answers at ${url}`,
    async () => {
      try {
        return (await fetch(url)).status === 200 ? true : undefined
      } catch {
        return undefined
      }
    },
    START_MS,
  )

/** Gives a port that is free now. */
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => {
        resolve(port)
      })
    })
  })

export const spawnNode = (args: string[], cwd = PACKAGE_DIR): Child => {
  const child = spawn('node', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  const lines: string[] = []
  for (const input of [child.stdout, child.stderr]) {
    createInterface({ input }).on('line', (line) => lines.push(line))
  }
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))
  return { process: child, lines, exited }
}

export const hasExited = (child: Child) => child.process.exitCode !== null || child.process.signalCode !== null

export const stopChild = async (child: Child | undefined) => {
  if (child === undefined || hasExited(child)) {
    return
  }
  child.process.kill('SIGTERM')
  await Promise.race([child.exited, sleep(10_000)])
  if (!hasExited(child)) {
    child.process.kill('SIGKILL')
    await child.exited
  }
}

/** Sends SIGINT (the Ctrl+C of a terminal) and gives the exit code. */
export const interrupt = async (child: Child) => {
  child.process.kill('SIGINT')
  const code = await Promise.race([child.exited, sleep(20_000).then(() => 'timeout' as const)])
  assert.notEqual(code, 'timeout', 'the process ends after SIGINT')
  return code
}

/** Waits for a line of the child that matches, and returns the match. */
export const waitForLine = (child: Child, what: string, pattern: RegExp, from = 0) =>
  waitFor(
    what,
    () => {
      for (const line of child.lines.slice(from)) {
        const match = pattern.exec(line)
        if (match !== null) {
          return match
        }
      }
      return undefined
    },
    START_MS,
  )

/** True when each pixel of the PNG has the color, with at most 2 of difference in each channel. */
export const isAllColor = (png: Buffer, color: string) => {
  const expected = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  const { data, width, height } = PNG.sync.read(png)
  assert.equal(width * height > 0, true, 'the image has pixels')
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(data[offset + channel] - expected[channel]) > 2) {
        return false
      }
    }
  }
  return true
}

export const sizeOf = (png: Buffer) => {
  const { width, height } = PNG.sync.read(png)
  return { width, height }
}

export const shotsOf = (lines: string[]): Shot[] =>
  lines.flatMap((line) => {
    const match = /^wishem-godot: shot \d+ seq (\d+) color #[0-9a-f]{6} file (.+)$/.exec(line)
    return match === null ? [] : [{ seq: Number(match[1]), file: match[2] }]
  })

/** Waits until the picture of the renderer is all of one color. Returns the picture. */
export const waitForColor = (renderer: Renderer, color: string, ms: number) =>
  waitFor(
    `${renderer.name} is ${color}`,
    async () => {
      const png = await renderer.picture()
      return isAllColor(png, color) ? png : undefined
    },
    ms,
  )

/** The names of the containers of the Godot runs with this screenshot folder (default: the folder of `scripts/godot.ts`) that exist, running or not. */
export const godotContainers = (shotsDir?: string) =>
  execFileSync('docker', ['ps', '-a', '--filter', `label=${godotLabel(shotsDir)}`, '--format', '{{.Names}}'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((name) => name !== '')
