// Runs the steps 1, 6, 7, 10, and 11 of the test guide of the change 629 with the command as a child process.
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { constructInputs } from '@thrashplay/wishem-construct-manager'
import type { ConstructEntry, ConstructList } from '@thrashplay/wishem-construct-manager'
import { openLink, webSocketChannel, type Port } from '@thrashplay/wishem-hub'
import { COUNT_FIELD, COUNTER_TYPE } from '@thrashplay/wishem-sample-product'

const packageRoot = path.resolve(import.meta.dirname, '..')
const cli = path.join(packageRoot, 'dist', 'cli.js')
const workbenchModel = path.join(packageRoot, '..', 'workbench', 'model')
const sampleModel = path.join(packageRoot, '..', 'sample-product', 'model')
const USAGE = 'usage: wishem start <folder> [--product <folder>] [--product-code <module>] [--port <number>]'
const EXIT_3 = 'The process of the construct ended with the exit code 3.'

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

/** Waits for the end of the command; fails with the output after the limit. */
const ended = async (run: Run, ms = 30000) => {
  let timer: NodeJS.Timeout | undefined
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`the command did not end in ${String(ms)} ms: ${run.output()}`))
    }, ms)
  })
  try {
    return await Promise.race([run.exit, limit])
  } finally {
    clearTimeout(timer)
  }
}

const countAndTicks = (client: Client) => {
  const state = client.port.read()
  return {
    count: Number(new RegExp(`"${COUNT_FIELD}":(\\d+)`).exec(JSON.stringify(state.store))?.[1]),
    ticks: (state.time as { ticks: number }).ticks,
  }
}

describe('the test guide: the command loads the product code', () => {
  let folder = ''
  let model = ''
  let product = ''
  let code = ''
  const runs: Run[] = []
  const clients: Client[] = []

  const writeCode = (body: string) => {
    writeFileSync(
      code,
      [
        "import { appendFileSync } from 'node:fs'",
        "appendFileSync(new URL('./loaded.txt', import.meta.url), process.pid + '\\n')",
        `export const behaviors = [{ id: 'guide/count', componentType: '${COUNTER_TYPE}', update: (f) => { ${body} } }]`,
      ].join('\n'),
    )
  }

  const loaded = () =>
    readFileSync(path.join(folder, 'loaded.txt'), 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map(Number)

  const start = (args: string[], cwd?: string): Run => {
    const child = spawn(process.execPath, [cli, 'start', model, ...args, '--port', '0'], {
      cwd,
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

  const started = async (productCode = code) => {
    const run = start(['--product', product, '--product-code', productCode])
    await until(
      () => run.output().includes('link at') || run.child.exitCode !== null,
      () => run.output(),
    )
    const address = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''
    return { run, address }
  }

  /** Runs the command with the arguments until it ends. */
  const failed = async (args: string[]) => {
    const run = start(args)
    const exit = await ended(run)
    return { exit, output: run.output() }
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

  const startPlay = async (run: Run, command: Client, running?: boolean) => {
    expect(await command.port.submit(constructInputs.start('play', { running }))).toMatchObject({ ok: true })
    await until(
      () => entryOf(command)?.status === 'running' && entryOf(command)?.link !== undefined,
      () => run.output(),
    )
    const pids = [...run.output().matchAll(/construct play runs in the process (\d+)/g)].map((match) =>
      Number(match[1]),
    )
    return { pid: pids[pids.length - 1], address: entryOf(command)?.link ?? '' }
  }

  const stopPlay = async (command: Client) => {
    expect(await command.port.submit(constructInputs.stop('play'))).toMatchObject({ ok: true })
    await until(
      () => entryOf(command)?.status === 'stopped',
      () => JSON.stringify(entryOf(command)),
    )
  }

  const advance = async (command: Client, play: Client, from: number) => {
    const input = { type: 'time/advance', payload: { ms: 50 } }
    expect(await command.port.submit(constructInputs.send('play', input as never))).toMatchObject({ ok: true })
    await until(
      () => countAndTicks(play).count > from,
      () => JSON.stringify(play.port.read().store),
    )
  }

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'wishem-command-code-guide-'))
    model = path.join(folder, 'model')
    product = path.join(folder, 'product')
    code = path.join(folder, 'code.mjs')
    cpSync(workbenchModel, model, { recursive: true })
    cpSync(sampleModel, product, { recursive: true })
    writeCode(`return { ...f, '${COUNT_FIELD}': f['${COUNT_FIELD}'] + 1 }`)
  })

  afterEach(async () => {
    clients.splice(0).forEach((client) => {
      client.close()
    })
    const pids = new Set<number>()
    try {
      for (const run of runs.splice(0)) {
        const group = run.child.pid ?? 0
        if (Number.isInteger(group) && group > 1) {
          try {
            // The group holds the command, the check child, and each product construct process.
            process.kill(-group, 'SIGKILL')
          } catch {
            // the group ended
          }
        }
        for (const match of run.output().matchAll(/runs in the process (\d+)/g)) {
          pids.add(Number(match[1]))
        }
        await ended(run, 5000)
      }
      for (const file of ['loaded.txt', 'loop-pid.txt']) {
        try {
          readFileSync(path.join(folder, file), 'utf8')
            .split('\n')
            .filter((line) => line !== '')
            .forEach((line) => pids.add(Number(line)))
        } catch {
          // the file does not exist
        }
      }
      for (const pid of pids) {
        await until(
          () => !alive(pid),
          () => `the process ${String(pid)} is alive`,
          5000,
        )
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('does the steps 1, 6, and 7', { timeout: 60000 }, async () => {
    // Step 1: the lines, and the module loads in a child process only.
    const { run, address } = await started()
    const commandPid = run.child.pid ?? 0
    expect(run.output().trimEnd().split('\n')).toEqual([
      `wishem: model ${model}`,
      `wishem: product ${product}`,
      `wishem: product code ${code}`,
      'wishem: 1 component type, 1 entity',
      'wishem: product: 2 component types, 1 entity',
      `wishem: link at ${address}`,
    ])
    const checkIds = loaded()
    expect(checkIds).toHaveLength(1)
    expect(checkIds[0]).not.toBe(commandPid)
    const command = await connect(address, 'guide-command')
    const first = await startPlay(run, command, false)
    expect(first.pid).not.toBe(commandPid)
    expect(loaded()).toHaveLength(2)
    expect(loaded()[1]).toBe(first.pid)

    // Step 6: a new version of the code runs after a stop and a start.
    const play = await connect(first.address, 'guide-play')
    const base = countAndTicks(play).count
    await advance(command, play, base)
    expect(countAndTicks(play).count).toBe(base + 1)
    writeCode(`return { ...f, '${COUNT_FIELD}': f['${COUNT_FIELD}'] + 10 }`)
    await stopPlay(command)
    expect(run.output()).toContain('wishem: construct play stopped')
    const second = await startPlay(run, command, false)
    expect(second.pid).not.toBe(first.pid)
    expect(loaded()[2]).toBe(second.pid)
    const play2 = await connect(second.address, 'guide-play-2')
    expect(countAndTicks(play2).count).toBe(base)
    await advance(command, play2, base)
    expect(countAndTicks(play2).count).toBe(base + 10)

    // Step 7: a behavior that ends its process.
    writeCode('process.exit(3)')
    await stopPlay(command)
    expect(await command.port.submit(constructInputs.start('play'))).toMatchObject({ ok: true })
    await until(
      () => entryOf(command)?.status === 'failed',
      () => run.output(),
    )
    expect(run.output()).toContain(`wishem: construct play failed: ${EXIT_3}`)
    expect(JSON.stringify(entryOf(command))).toContain(EXIT_3)
    const again = await connect(address, 'guide-command-2')
    expect(Object.keys(again.port.read())).toContain('constructs')
    expect(alive(second.pid)).toBe(false)
    expect(run.child.exitCode).toBeNull()

    // A stop and a start give the status running again.
    writeCode(`return { ...f, '${COUNT_FIELD}': f['${COUNT_FIELD}'] + 1 }`)
    expect(await command.port.submit(constructInputs.stop('play'))).toMatchObject({ ok: true })
    const recovered = await startPlay(run, command, false)
    expect(alive(recovered.pid)).toBe(true)
    expect(entryOf(command)?.status).toBe('running')
  })

  it(
    'resolves a product code path that starts with a dot from the folder of the process',
    { timeout: 40000 },
    async () => {
      const run = start(['--product', product, '--product-code', './code.mjs'], folder)
      await until(
        () => run.output().includes('link at') || run.child.exitCode !== null,
        () => run.output(),
      )
      expect(run.output()).toContain('wishem: product code ./code.mjs\n')
      expect(run.output()).toContain('link at')
      expect(loaded()).toHaveLength(1)
      // The product construct process loads the same module.
      const address = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''
      const command = await connect(address, 'guide-command')
      const play = await startPlay(run, command, false)
      expect(loaded()).toHaveLength(2)
      expect(loaded()[1]).toBe(play.pid)
    },
  )

  it(
    'exits with code 1 and names the value for a package name that cannot be resolved',
    { timeout: 40000 },
    async () => {
      const { exit, output } = await failed(['--product', product, '--product-code', '@nope/nothing'])
      expect(exit).toBe(1)
      expect(output).toContain(
        "wishem: the product code @nope/nothing cannot be loaded: Cannot find package '@nope/nothing'",
      )
      expect(output).not.toContain('link at')
    },
  )

  it('resolves a package name from the package of the command', { timeout: 40000 }, async () => {
    // The package of the command can resolve its own name. The check process cannot.
    const name = '@thrashplay/wishem-command/package.json'
    const { exit, output } = await failed(['--product', product, '--product-code', name])
    expect(exit).toBe(1)
    expect(output).toContain(`wishem: the product code ${name} cannot be loaded: `)
    expect(output).not.toContain('Cannot find package')
  })

  it('does the step 10: the product code as a package name', { timeout: 40000 }, async () => {
    const { run, address } = await started('@thrashplay/wishem-sample-product')
    expect(run.output()).toContain('wishem: product code @thrashplay/wishem-sample-product\n')
    const command = await connect(address, 'guide-command')
    const { pid, address: playAddress } = await startPlay(run, command)
    expect(alive(pid)).toBe(true)
    const play = await connect(playAddress, 'guide-play')
    await until(
      () => countAndTicks(play).ticks > 0,
      () => JSON.stringify(play.port.read().time),
    )
    const before = countAndTicks(play)
    await until(
      () => countAndTicks(play).ticks > before.ticks + 2,
      () => JSON.stringify(play.port.read().time),
    )
    const after = countAndTicks(play)
    expect(after.count).toBeGreaterThan(before.count)
    expect(after.count - before.count).toBe(after.ticks - before.ticks)
  })

  it('does the step 11: the checks at the start', { timeout: 60000 }, async () => {
    // (1) No product folder.
    const noProduct = await failed(['--product-code', code])
    expect(noProduct.exit).toBe(2)
    expect(noProduct.output).toContain('wishem: --product-code needs --product')
    expect(noProduct.output).toContain(USAGE)

    // (2) An empty value.
    const empty = await failed(['--product', product, '--product-code', ''])
    expect(empty.exit).toBe(2)
    expect(empty.output).toContain(USAGE)

    // (3) A file that does not exist.
    const missing = path.join(folder, 'missing.mjs')
    const missingRun = await failed(['--product', product, '--product-code', missing])
    expect(missingRun.exit).toBe(1)
    expect(missingRun.output).toContain(`wishem: the product code ${missing} cannot be loaded: `)
    expect(missingRun.output).not.toContain('link at')

    // (4) A module with no list of behaviors.
    const bad = path.join(folder, 'bad.mjs')
    writeFileSync(bad, "export const behaviors = 'count'\n")
    const badRun = await failed(['--product', product, '--product-code', bad])
    expect(badRun.exit).toBe(1)
    expect(badRun.output).toContain(
      'wishem: the product code has no correct list behaviors: The behaviors are not a list.',
    )
    expect(badRun.output).not.toContain('link at')

    // (5) A module that does not end.
    const loop = path.join(folder, 'loop.mjs')
    writeFileSync(
      loop,
      "import { appendFileSync } from 'node:fs'\nappendFileSync(new URL('./loop-pid.txt', import.meta.url), process.pid + '\\n')\nfor (;;) {}\n",
    )
    const began = Date.now()
    const loopRun = await failed(['--product', product, '--product-code', loop])
    const seconds = (Date.now() - began) / 1000
    expect(loopRun.exit).toBe(1)
    expect(loopRun.output).toContain(
      `wishem: the product code ${loop} cannot be loaded: The check did not end in 5 seconds.`,
    )
    expect(loopRun.output).not.toContain('link at')
    expect(seconds).toBeGreaterThanOrEqual(5)
    expect(seconds).toBeLessThanOrEqual(7)
    const checkPids = readFileSync(path.join(folder, 'loop-pid.txt'), 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map(Number)
    expect(checkPids).toHaveLength(1)
    expect(alive(checkPids[0])).toBe(false)
  })
})
