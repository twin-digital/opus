// @vitest-environment node
// Runs the steps 1, 2, 5, 6, 7, 10, 11, and 12 of the test guide of the change 628 with the script as a child process.
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { constructInputs } from '@thrashplay/wishem-construct-manager'
import type { ConstructEntry, ConstructList } from '@thrashplay/wishem-construct-manager'
import { storeInputs } from '@thrashplay/wishem-core'
import { openLink, webSocketChannel, type Port } from '@thrashplay/wishem-hub'
import { COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'

const script = join(import.meta.dirname, '..', 'scripts', 'start.ts')
const workbenchModel = join(import.meta.dirname, '..', '..', 'workbench', 'model')
const sampleModel = join(import.meta.dirname, '..', '..', 'sample-product', 'model')

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

const until = async (check: () => boolean, describeState: () => string, ms = 30000) => {
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

describe('the test guide: each product construct runs in a process of its own', () => {
  let folder = ''
  let model = ''
  let product = ''
  let views = ''
  const runs: Run[] = []
  const clients: Client[] = []

  const writeCode = (body: string, tail = '') => {
    writeFileSync(
      join(folder, 'code.mjs'),
      [
        "import { appendFileSync } from 'node:fs'",
        "appendFileSync(new URL('./loaded.txt', import.meta.url), process.pid + '\\n')",
        "console.log('guide: loaded in ' + process.pid)",
        `export const behaviors = [{ id: 'guide/count', componentType: '${COUNTER_TYPE}', update: (f) => { ${body} } }]`,
        tail,
      ].join('\n'),
    )
  }
  const addTo = (amount: number) => `return { ...f, '${COUNT_FIELD}': f['${COUNT_FIELD}'] + ${String(amount)} }`
  const loadedIds = () => readFileSync(join(folder, 'loaded.txt'), 'utf8').trim().split('\n').map(Number)

  const start = (args: string[], env: Record<string, string> = {}): Run => {
    const child = spawn(
      'node',
      [script, '--model', model, '--views', views, '--no-view-types', '--port', '0', '--hub-port', '0', ...args],
      { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
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

  const startWorkbench = async () => {
    const run = start(['--product', product, '--product-code', './code.mjs'], { INIT_CWD: folder })
    await until(
      () => run.output().includes('wishem: workbench at') || run.child.exitCode !== null,
      () => run.output(),
    )
    return run
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

  const entryOf = (workbench: Client): ConstructEntry | undefined =>
    (workbench.port.read().constructs as ConstructList).constructs.play

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'workbench-child-guide-'))
    model = join(folder, 'model')
    product = join(folder, 'product')
    views = join(folder, 'views')
    cpSync(workbenchModel, model, { recursive: true })
    cpSync(sampleModel, product, { recursive: true })
    writeCode(addTo(1))
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
    // The check child and each product construct child write their pid to loaded.txt.
    try {
      loadedIds().forEach((pid) => pids.add(pid))
    } catch {
      // no process loaded the code
    }
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // the process ended
      }
    }
    rmSync(folder, { recursive: true, force: true })
  })

  it('does the steps 1, 2, 5, 6, 7, and 10', { timeout: 90000 }, async () => {
    // Step 1: the check runs in a child process that ended.
    const run = await startWorkbench()
    const scriptPid = run.child.pid ?? 0
    expect(loadedIds()).toHaveLength(1)
    expect(loadedIds()).not.toContain(scriptPid)
    expect(alive(loadedIds()[0] ?? 0)).toBe(false)
    const address = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''
    const page = /wishem: workbench at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(run.output())?.[1] ?? ''
    const pageSocket = page.replace('http:', 'ws:')
    const workbench = await connect(address, 'guide-workbench')
    const send = (input: object) => workbench.port.submit(constructInputs.send('play', input as never))
    const pidOf = (nth: number) =>
      Number([...run.output().matchAll(/construct play runs in the process (\d+)/g)][nth]?.[1])

    // Step 2: play runs in a process of its own.
    expect(await workbench.port.submit(constructInputs.start('play'))).toMatchObject({ ok: true })
    await until(
      () => /construct play: guide: loaded in \d+/.test(run.output()) && run.output().includes('runs, link at'),
      () => run.output(),
    )
    const first = pidOf(0)
    expect(first).not.toBe(scriptPid)
    expect(run.output()).toMatch(/wishem: construct play runs, link at ws:\/\/127\.0\.0\.1:\d+\/link/)
    expect(run.output()).toContain(`wishem: construct play: guide: loaded in ${String(first)}`)
    expect(loadedIds().at(-1)).toBe(first)
    expect(alive(first)).toBe(true)
    const play = await connect(`${pageSocket}constructs/play/link`, 'guide-play')
    await until(
      () => ticksOf(play) > 3 && countOf(play) > 3,
      () => JSON.stringify(play.port.read().time),
    )

    // Step 5: a new version of the code runs after a stop and a start.
    writeCode(addTo(10))
    expect(await workbench.port.submit(constructInputs.stop('play'))).toMatchObject({ ok: true })
    await until(
      () => run.output().includes('wishem: construct play stopped'),
      () => run.output(),
    )
    await until(
      () => !alive(first),
      () => `process ${String(first)} runs`,
    )
    expect(await workbench.port.submit(constructInputs.start('play', { running: false }))).toMatchObject({ ok: true })
    await until(
      () => pidOf(1) > 0 && entryOf(workbench)?.link !== undefined,
      () => run.output(),
    )
    const second = pidOf(1)
    expect(second).not.toBe(first)
    const again = await connect(`${pageSocket}constructs/play/link`, 'guide-again')
    const base = countOf(again)
    expect(await send({ type: 'time/advance', payload: { ms: 50 } })).toMatchObject({ ok: true })
    await until(
      () => countOf(again) !== base,
      () => String(countOf(again)),
    )
    expect(countOf(again)).toBe(base + 10)

    // Step 6: a behavior that ends its process.
    writeCode('process.exit(3)')
    await workbench.port.submit(constructInputs.stop('play'))
    await until(
      () => !alive(second),
      () => `process ${String(second)} runs`,
    )
    await workbench.port.submit(constructInputs.start('play'))
    await until(
      () => entryOf(workbench)?.status === 'failed',
      () => run.output(),
    )
    expect(entryOf(workbench)?.message).toBe('The process of the construct ended with the exit code 3.')
    expect(run.output()).toContain(
      'wishem: construct play failed: The process of the construct ended with the exit code 3.',
    )
    expect(alive(pidOf(2))).toBe(false)
    expect(Object.keys(workbench.port.read()).sort()).toEqual(['constructs', 'product', 'store'])

    // Step 7: a behavior that does not end.
    writeCode('for (;;) {}')
    await workbench.port.submit(constructInputs.stop('play'))
    await workbench.port.submit(constructInputs.start('play'))
    await until(
      () => pidOf(3) > 0,
      () => run.output(),
    )
    const started = Date.now()
    const setField = await workbench.port.submit(
      storeInputs('product').setField({
        entity: SAMPLE_ENTITY,
        componentType: COUNTER_TYPE,
        field: COUNT_FIELD,
        value: 7,
      }),
    )
    expect(setField).toMatchObject({ ok: true })
    expect(Date.now() - started).toBeLessThan(4000)
    await until(
      () => entryOf(workbench)?.status === 'failed',
      () => run.output(),
      20000,
    )
    expect(entryOf(workbench)?.message).toBe('The construct did not answer in 5 seconds.')
    expect(run.output()).toContain('wishem: construct play failed: The construct did not answer in 5 seconds.')
    expect(alive(pidOf(3))).toBe(false)

    // Step 10: a stop of the workbench ends the product construct process.
    writeCode(addTo(1))
    await workbench.port.submit(constructInputs.stop('play'))
    await workbench.port.submit(constructInputs.start('play'))
    await until(
      () => pidOf(4) > 0 && entryOf(workbench)?.status === 'running',
      () => run.output(),
    )
    const last = pidOf(4)
    expect(alive(last)).toBe(true)
    run.child.kill('SIGINT')
    expect(await run.exit).toBe(0)
    expect(run.output()).toContain('wishem: construct play stopped')
    expect(alive(last)).toBe(false)
  })

  it('does the step 11: a killed workbench leaves no process', { timeout: 40000 }, async () => {
    const run = await startWorkbench()
    const address = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''
    const workbench = await connect(address, 'guide-workbench')
    await workbench.port.submit(constructInputs.start('play'))
    await until(
      () => /construct play runs in the process \d+/.test(run.output()),
      () => run.output(),
    )
    const pid = Number(/construct play runs in the process (\d+)/.exec(run.output())?.[1])
    expect(alive(pid)).toBe(true)

    run.child.kill('SIGKILL')
    await run.exit

    await until(
      () => !alive(pid),
      () => `process ${String(pid)} runs`,
      10000,
    )
  })

  it('does the step 12: the checks at the start', { timeout: 60000 }, async () => {
    writeCode('return f', 'for (;;) {}')
    const started = Date.now()
    const endless = start(['--product', product, '--product-code', './code.mjs'], { INIT_CWD: folder })
    expect(await endless.exit).toBe(1)
    expect(Date.now() - started).toBeGreaterThan(4500)
    expect(endless.output()).toContain(
      'wishem: the product code ./code.mjs cannot be loaded: The check did not end in 5 seconds.',
    )
    expect(endless.output()).not.toContain('wishem: workbench at')

    const missing = start(['--product', product, '--product-code', './missing.mjs'], { INIT_CWD: folder })
    expect(await missing.exit).toBe(1)
    expect(missing.output()).toMatch(/wishem: the product code \.\/missing\.mjs cannot be loaded: .*missing\.mjs/)
    expect(loadedIds()).toHaveLength(1)
    expect(alive(loadedIds()[0] ?? 0)).toBe(false)
  })
})
