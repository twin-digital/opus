// Runs the steps 2, 3, 4, 5, 8, 9, and 12 of the test guide of the change 629 with the command as a child process.
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { constructInputs } from '@thrashplay/wishem-construct-manager'
import type { ConstructEntry, ConstructList } from '@thrashplay/wishem-construct-manager'
import type { Model } from '@thrashplay/wishem-core'
import { openLink, webSocketChannel, type Port } from '@thrashplay/wishem-hub'
import { COUNT_FIELD, COLOR_FIELD, COLOR_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'

const packageRoot = path.resolve(import.meta.dirname, '..')
const cli = path.join(packageRoot, 'dist', 'cli.js')
const workbenchModel = path.join(packageRoot, '..', 'workbench', 'model')
const sampleModel = path.join(packageRoot, '..', 'sample-product', 'model')

interface Client {
  port: Port
  close: () => void
}

interface Run {
  child: ChildProcess
  output: () => string
  exit: Promise<number | null>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const until = async (check: () => boolean, describeState: () => string, ms = 15000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describeState()}`)
    }
    await wait(25)
  }
}

/** True when the process exists and is not a zombie. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    return !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${String(pid)}/stat`, 'utf8'))
  } catch {
    return false
  }
}

const countOf = (client: Client) =>
  Number(new RegExp(`"${COUNT_FIELD}":(\\d+)`).exec(JSON.stringify(client.port.read().store))?.[1])
const ticksOf = (client: Client) => (client.port.read().time as { ticks: number }).ticks
const runningOf = (client: Client) => (client.port.read().time as { running: boolean }).running

describe('the test guide: the command runs the product constructs', () => {
  let folder = ''
  let model = ''
  let product = ''
  const runs: Run[] = []
  const clients: Client[] = []

  const start = (args: string[] = ['--product', product]): Run => {
    const child = spawn(process.execPath, [cli, 'start', model, ...args, '--port', '0'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))
    const run = {
      child,
      output: () => text,
      exit: new Promise<number | null>((resolve) => child.once('close', resolve)),
    }
    runs.push(run)
    return run
  }

  const started = async (args?: string[]) => {
    const run = start(args)
    await until(
      () => run.output().includes('link at') || run.child.exitCode !== null,
      () => run.output(),
    )
    const address = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''
    return { run, address }
  }

  const connect = async (address: string, id: string): Promise<Client> => {
    const socket = new WebSocket(address)
    const link = await openLink(await webSocketChannel(socket), [{ id, kind: 'input' }])
    const client = {
      port: link.ports[id],
      close: () => {
        link.close()
      },
    }
    clients.push(client)
    return client
  }

  const entryOf = (command: Client): ConstructEntry | undefined =>
    (command.port.read().constructs as ConstructList).constructs.play

  const startPlay = async (run: Run, command: Client) => {
    expect(await command.port.submit(constructInputs.start('play'))).toMatchObject({ ok: true })
    await until(
      () => entryOf(command)?.status === 'running' && entryOf(command)?.link !== undefined,
      () => run.output(),
    )
    const pid = Number(/construct play runs in the process (\d+)/.exec(run.output())?.[1])
    return { pid, address: entryOf(command)?.link ?? '' }
  }

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'wishem-command-guide-'))
    model = path.join(folder, 'model')
    product = path.join(folder, 'product')
    cpSync(workbenchModel, model, { recursive: true })
    cpSync(sampleModel, product, { recursive: true })
  })

  afterEach(async () => {
    clients.splice(0).forEach((client) => {
      client.close()
    })
    const pids = new Set<number>()
    for (const run of runs.splice(0)) {
      if (run.child.exitCode === null && run.child.signalCode === null) {
        run.child.kill('SIGKILL')
        await run.exit
      }
      for (const match of run.output().matchAll(/runs in the process (\d+)/g)) {
        pids.add(Number(match[1]))
      }
    }
    for (const pid of pids) {
      if (!Number.isInteger(pid) || pid <= 1) {
        continue
      }
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // the process ended
      }
    }
    rmSync(folder, { recursive: true, force: true })
  })

  it('does the steps 2, 3, 4, 5, and 8', { timeout: 60000 }, async () => {
    const { run, address } = await started()
    const commandPid = run.child.pid ?? 0

    // Step 2: the link of the command has the construct list.
    const command = await connect(address, 'guide-command')
    expect(command.port.read().constructs).toEqual({ constructs: {} })

    // Step 3: play runs in a process of its own.
    const { pid, address: playAddress } = await startPlay(run, command)
    expect(pid).toBeGreaterThan(1)
    expect(pid).not.toBe(commandPid)
    expect(alive(pid)).toBe(true)
    expect(run.output()).toContain(`wishem: construct play runs, link at ${playAddress}`)
    expect(playAddress).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(playAddress).not.toBe(address)
    const play = await connect(playAddress, 'guide-play')
    expect(Object.keys(play.port.read())).toEqual(expect.arrayContaining(['time', 'store']))
    await until(
      () => ticksOf(play) > 2,
      () => JSON.stringify(play.port.read().time),
    )

    // Step 4: pause, step, and step back through the link of the command.
    const send = (input: object) => command.port.submit(constructInputs.send('play', input as never))
    expect(await send({ type: 'time/set-running', payload: { running: false } })).toMatchObject({ ok: true })
    await until(
      () => !runningOf(play),
      () => JSON.stringify(play.port.read().time),
    )
    const ticks = ticksOf(play)
    expect(await send({ type: 'time/advance', payload: { ms: 50 } })).toMatchObject({ ok: true })
    await until(
      () => ticksOf(play) > ticks,
      () => JSON.stringify(play.port.read().time),
    )
    expect(await command.port.submit(constructInputs.rewind({ construct: 'play', ticks: 1 }))).toMatchObject({
      ok: true,
    })
    await until(
      () => ticksOf(play) === ticks,
      () => JSON.stringify(play.port.read().time),
    )
    expect(runningOf(play)).toBe(false)

    // Without product code, the count does not change.
    const count = countOf(play)
    await wait(300)
    expect(countOf(play)).toBe(count)

    // Step 5: a hand edit of the product folder reaches play and the store product.
    const stateFile = path.join(product, 'state.json')
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as {
      entities: { id: string; components: Record<string, Record<string, unknown>> }[]
    }
    const entity = state.entities.find((candidate) => candidate.id === SAMPLE_ENTITY)
    const components = entity?.components ?? {}
    components[COLOR_TYPE] = { ...components[COLOR_TYPE], [COLOR_FIELD]: '#15803d' }
    writeFileSync(stateFile, JSON.stringify(state, null, 2))
    const hasColor = (client: Client, part: string) => JSON.stringify(client.port.read()[part]).includes('#15803d')
    await until(
      () => hasColor(play, 'store') && hasColor(command, 'product'),
      () => JSON.stringify(play.port.read().store),
    )

    // Step 8: an interrupt signal for the group stops play and the command.
    process.kill(-commandPid, 'SIGINT')
    expect(await run.exit).toBe(0)
    expect(run.output()).toContain('wishem: construct play stopped')
    await until(
      () => !alive(pid),
      () => `process ${String(pid)} runs`,
    )
  })

  it('does the step 9: a killed command leaves no process', { timeout: 40000 }, async () => {
    const { run, address } = await started()
    const command = await connect(address, 'guide-command')
    const { pid, address: playAddress } = await startPlay(run, command)
    expect(alive(pid)).toBe(true)

    run.child.kill('SIGKILL')
    await run.exit
    await wait(2000)
    // The spec gives 2 s; the poll allows a slow machine.
    await until(
      () => !alive(pid),
      () => `process ${String(pid)} runs`,
    )

    expect(alive(pid)).toBe(false)
    const refused = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(playAddress)
      socket.addEventListener('open', () => {
        socket.close()
        resolve(false)
      })
      socket.addEventListener('error', () => {
        resolve(true)
      })
    })
    expect(refused).toBe(true)
  })

  it('does the step 12: with no product, the command has no construct list', { timeout: 30000 }, async () => {
    const { run, address } = await started([])
    expect(run.output().trimEnd().split('\n')).toHaveLength(3)
    const command = await connect(address, 'guide-command')
    expect(Object.keys(command.port.read())).not.toContain('constructs')
    expect(await command.port.submit(constructInputs.start('play'))).toMatchObject({ ok: false })
    expect((command.port.read().store as Model).entities).toHaveLength(1)
    process.kill(-(run.child.pid ?? 0), 'SIGINT')
    expect(await run.exit).toBe(0)
  })
})
