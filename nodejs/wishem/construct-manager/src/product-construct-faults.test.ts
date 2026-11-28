import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { timeInputs } from '@thrashplay/wishem-clock'
import { COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import type { FieldValue, Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { childProcessLauncher } from './node.js'
import type { ChildProcessLauncherOptions, LaunchedConstruct } from './node.js'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const behaviorCode = (body: string): string =>
  `export const behaviors = [{ id: 'fault', componentType: ${JSON.stringify(COUNTER_TYPE)}, update: (fields) => { ${body} } }]\n`

const countOf = (state: Readonly<Record<string, unknown>>): FieldValue | undefined =>
  (state.store as Model).entities.find((entity) => entity.id === SAMPLE_ENTITY)?.components[COUNTER_TYPE]?.[COUNT_FIELD]

describe('the faults of a product construct process', () => {
  const launched: LaunchedConstruct[] = []
  const pids: number[] = []
  let folder = ''

  const writeCode = async (name: string, text: string) => {
    const file = join(folder, name)
    await writeFile(file, text)
    return pathToFileURL(file).href
  }

  const launch = async (options: ChildProcessLauncherOptions, running = true) => {
    const construct = await childProcessLauncher(options)(
      { id: 'play', model, running },
      { onProcess: (pid) => pids.push(pid) },
    )
    launched.push(construct)
    return construct
  }

  const expectLaunchError = async (options: ChildProcessLauncherOptions, message: string | RegExp) => {
    await expect(
      childProcessLauncher(options)({ id: 'play', model, running: true }, { onProcess: (pid) => pids.push(pid) }),
    ).rejects.toThrow(message)
    expect(alive(pids[pids.length - 1])).toBe(false)
  }

  afterEach(async () => {
    for (const pid of pids.splice(0)) {
      if (alive(pid)) {
        process.kill(pid, 'SIGKILL')
      }
    }
    for (const construct of launched.splice(0)) {
      await construct.close()
    }
    if (folder !== '') {
      await rm(folder, { recursive: true, force: true })
    }
  })

  const setup = async () => {
    folder = await mkdtemp(join(tmpdir(), 'wishem-product-construct-faults-'))
  }

  it('resolves ended with the exit code of a behavior that calls process.exit(3)', async () => {
    await setup()
    const productCode = await writeCode('exit.mjs', behaviorCode('process.exit(3)'))
    const construct = await launch({ productCode, stepMs: 10 })
    expect(await construct.ended).toBe('The process of the construct ended with the exit code 3.')
    expect(alive(construct.pid)).toBe(false)
  })

  it('resolves ended with the signal when the test sends SIGTERM to the child', async () => {
    await setup()
    const construct = await launch({})
    process.kill(construct.pid, 'SIGTERM')
    expect(await construct.ended).toBe('The process of the construct ended with the signal SIGTERM.')
  })

  it(
    'kills a child whose behavior does not end, and resolves ended in less than 2 seconds',
    { timeout: 10000 },
    async () => {
      await setup()
      const productCode = await writeCode('loop.mjs', behaviorCode('for (;;) {}'))
      const begin = Date.now()
      const construct = await launch({ productCode, stepMs: 10, pingMs: 200, answerMs: 1000 })
      expect(await construct.ended).toBe('The construct did not answer in 1 second.')
      expect(Date.now() - begin).toBeLessThan(2000)
      expect(alive(construct.pid)).toBe(false)
    },
  )

  it(
    'rejects a submit of a paused construct whose behavior does not end, and the process ends',
    { timeout: 10000 },
    async () => {
      await setup()
      const productCode = await writeCode('loop-paused.mjs', behaviorCode('for (;;) {}'))
      const construct = await launch({ productCode, pingMs: 60000, answerMs: 1000 }, false)
      await expect(construct.input.submit(timeInputs.advance(50))).rejects.toThrow(
        'The construct did not answer in 1 second.',
      )
      await construct.ended
      expect(alive(construct.pid)).toBe(false)
    },
  )

  it('rejects the launch of a module that does not end at its top level, and the process ends', async () => {
    await setup()
    const productCode = await writeCode('top-loop.mjs', 'for (;;) {}\nexport const behaviors = []\n')
    await expectLaunchError({ productCode, startMs: 1000 }, 'The construct did not start in 1 second.')
  })

  it('rejects the launch of a file that is not correct JavaScript, and the process ends', async () => {
    await setup()
    const productCode = await writeCode('broken.mjs', 'export const behaviors = [\n')
    await expectLaunchError({ productCode }, /\S/)
  })

  it('rejects the launch of a module whose behaviors are the text count, and the process ends', async () => {
    await setup()
    const productCode = await writeCode('text.mjs', "export const behaviors = 'count'\n")
    await expectLaunchError({ productCode }, 'The behaviors are not a list.')
  })

  it('ends after close() in less than 1.5 seconds for a behavior that does not end, with stopMs 500', async () => {
    await setup()
    const productCode = await writeCode('loop-stop.mjs', behaviorCode('for (;;) {}'))
    const construct = await launch({ productCode, stepMs: 10, pingMs: 60000, stopMs: 500 })
    await new Promise((resolve) => setTimeout(resolve, 200))
    const begin = Date.now()
    await construct.close()
    expect(Date.now() - begin).toBeLessThan(1500)
    expect(alive(construct.pid)).toBe(false)
  })

  it('never resolves ended after close()', async () => {
    await setup()
    const construct = await launch({})
    let resolved = false
    void construct.ended.then(() => {
      resolved = true
    })
    await construct.close()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(resolved).toBe(false)
  })

  it('gives the new behavior in the next launch and keeps the old behavior in the running construct', async () => {
    await setup()
    const code = (value: number) =>
      behaviorCode(`return { ...fields, ${JSON.stringify(COUNT_FIELD)}: ${String(value)} }`)
    const productCode = await writeCode('changing.mjs', code(1))
    const first = await launch({ productCode, stepMs: 5 })
    await vi.waitFor(() => {
      expect(countOf(first.reader.read())).toBe(1)
    })
    await writeFile(join(folder, 'changing.mjs'), code(2))
    const second = await launch({ productCode, stepMs: 5 })
    await vi.waitFor(() => {
      expect(countOf(second.reader.read())).toBe(2)
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(countOf(first.reader.read())).toBe(1)
  })
})
