// @vitest-environment node
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DOCKER_REQUIRED_MESSAGE, type ChildProcessLike, type DockerCli } from './docker.js'
import { runGodot, type GodotRun } from './run-godot.js'

/** A child process that ends when its stdin ends or when it is killed. */
class FakeChild extends EventEmitter implements ChildProcessLike {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  private ended = false

  constructor() {
    super()
    this.stdin.on('finish', () => {
      this.end()
    })
  }

  kill() {
    this.end()
  }

  end() {
    if (!this.ended) {
      this.ended = true
      this.stdout.end()
      this.stderr.end()
      this.emit('exit', 0)
    }
  }
}

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('runGodot', () => {
  let shotsDir: string
  let events: string[]
  let children: FakeChild[]
  let lines: string[]
  let runs: GodotRun[]
  let infoWorks: boolean
  let cpWorks: boolean

  beforeEach(() => {
    shotsDir = mkdtempSync(join(tmpdir(), 'wishem-godot-shots-'))
    events = []
    children = []
    lines = []
    runs = []
    infoWorks = true
    cpWorks = true
  })

  afterEach(async () => {
    await Promise.all(runs.map((run) => run.close()))
    rmSync(shotsDir, { recursive: true, force: true })
  })

  const fakeDocker = (): DockerCli => ({
    run: (args) => {
      events.push(`run ${args.join(' ')}`)
      if (args[0] === 'info') {
        return infoWorks ? 'ok' : undefined
      }
      if (args[0] === 'cp' && args[1].includes(':/out/') && !cpWorks) {
        return undefined
      }
      if (args[0] === 'ps') {
        return 'old1\nold2\n'
      }
      return ''
    },
    spawn: (args) => {
      events.push(`spawn ${args.join(' ')}`)
      const child = new FakeChild()
      children.push(child)
      return child
    },
  })

  const start = async (options: { hubPort?: number } = {}) => {
    const run = await runGodot({
      docker: fakeDocker(),
      shotsDir,
      log: (line) => {
        lines.push(line)
        events.push(`log ${line}`)
      },
      ...options,
    })
    runs.push(run)
    return run
  }

  const commandOf = (prefix: string) => events.find((event) => event.startsWith(prefix))

  it('runs the Docker commands in order', async () => {
    const run = await start({ hubPort: 4760 })
    const commands = events.filter((event) => !event.startsWith('log '))
    const kinds = commands.map((event) => event.split(' ').slice(0, 2).join(' '))
    expect(kinds).toEqual([
      'run info',
      'run image',
      'run ps',
      'run rm',
      'run create',
      'run cp',
      'spawn start',
      'spawn exec',
    ])
    expect(commands[3]).toBe('run rm --force old1 old2')
    expect(commands[4]).toMatch(new RegExp(`^run create --name ${run.container} --label wishem-godot=[0-9a-f]{8} `))
    expect(commands[4]).toContain('--link ws://127.0.0.1:4760/link --shots /out')
    expect(commands[4]).toContain('--resolution 640x360')
    expect(commands[4]).toContain('--audio-driver Dummy')
    expect(commands[5]).toMatch(new RegExp(`/godot ${run.container}:/srv/godot$`))
    expect(commands[7]).toBe(`spawn exec -i ${run.container} node /srv/relay.mjs 4760`)
    expect(run.container).toMatch(/^wishem-godot-[0-9a-f]{8}$/)
  })

  it('gives each line of the application to log', async () => {
    await start()
    children[0].stdout.write('Godot Engine v4.7.2\nwishem-godot: connecting to x\n')
    children[0].stderr.write('a warning\n')
    await eventually(() => lines.includes('wishem-godot: connecting to x') && lines.includes('a warning'))
    expect(lines).toContain('Godot Engine v4.7.2')
  })

  it('copies a shot before it logs the line, and gives the local path', async () => {
    const run = await start()
    children[0].stdout.write('wishem-godot: shot 1 seq 0 color #1d4ed8 file /out/0001.png\n')
    await eventually(() => lines.some((line) => line.includes('shot 1')))
    const cp = events.findIndex(
      (event) => event === `run cp ${run.container}:/out/0001.png ${join(shotsDir, '0001.png')}`,
    )
    const log = events.findIndex((event) => event.startsWith('log wishem-godot: shot 1'))
    expect(cp).toBeGreaterThan(-1)
    expect(cp).toBeLessThan(log)
    expect(lines.find((line) => line.includes('shot 1'))).toBe(
      `wishem-godot: shot 1 seq 0 color #1d4ed8 file ${join(shotsDir, '0001.png')}`,
    )
  })

  it('logs an error and no shot line when the copy of a shot fails', async () => {
    cpWorks = false
    await start()
    children[0].stdout.write('wishem-godot: shot 1 seq 0 color #1d4ed8 file /out/0001.png\n')
    await eventually(() => lines.some((line) => line.includes('could not be copied')))
    expect(lines).toContain('wishem-godot: shot 1 could not be copied')
    expect(lines.some((line) => line.includes('seq 0'))).toBe(false)
  })

  it('empties the shots folder at the start', async () => {
    writeFileSync(join(shotsDir, '0001.png'), 'old')
    await start()
    expect(readdirSync(shotsDir)).toEqual([])
  })

  it('makes the shots folder when it is missing', async () => {
    rmSync(shotsDir, { recursive: true, force: true })
    await start()
    expect(existsSync(shotsDir)).toBe(true)
  })

  it('gives the same promise on each close and removes the container one time', async () => {
    const run = await start()
    const first = run.close()
    const second = run.close()
    expect(second).toBe(first)
    await first
    await run.close()
    expect(events.filter((event) => event === `run rm --force ${run.container}`)).toHaveLength(1)
  })

  it('resolves exited with the exit code of Godot', async () => {
    const run = await start()
    children[0].emit('exit', 3)
    await expect(run.exited).resolves.toBe(3)
  })

  it('gives the message and makes no container when Docker is not available', async () => {
    infoWorks = false
    await expect(start()).rejects.toThrow(DOCKER_REQUIRED_MESSAGE)
    expect(commandOf('run create')).toBeUndefined()
    expect(commandOf('spawn')).toBeUndefined()
  })
})
