import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(packageRoot, 'dist', 'cli.js')

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const COPY = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const MESSAGE = `Component types ${CT} and ${COPY} have the same label "AppBar"`

interface Run {
  child: ChildProcess
  lines: () => string[]
  exit: Promise<number | null>
}

const run = (args: string[]): Run => {
  const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  const exit = new Promise<number | null>((resolve) => child.on('close', resolve))
  return { child, lines: () => out.split('\n').filter((line) => line !== ''), exit }
}

const until = async (check: () => boolean, ms = 6000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const writeBase = async (folder: string) => {
  await mkdir(path.join(folder, 'definitions'), { recursive: true })
  await writeFile(
    path.join(folder, 'definitions', `${CT}.json`),
    JSON.stringify({ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }),
  )
  await writeFile(
    path.join(folder, 'state.json'),
    JSON.stringify({ entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }] }),
  )
}

describe('wishem start names the definition file of a duplicate label (test guide)', () => {
  let root: string
  let model: string
  let product: string
  let running: Run[]

  const start = () => {
    const process_ = run(['start', model, '--product', product, '--port', '0'])
    running.push(process_)
    return process_
  }
  const warnings = (process_: Run) => process_.lines().filter((line) => line.includes('warning'))
  const modelLine = `wishem: warning in definitions/zz-copy.json: ${MESSAGE}`

  beforeEach(async () => {
    running = []
    root = await mkdtemp(path.join(tmpdir(), 'wishem-guide-'))
    model = path.join(root, 'model')
    product = path.join(root, 'product')
    await writeBase(model)
    await writeBase(product)
    await writeFile(
      path.join(model, 'definitions', 'zz-copy.json'),
      JSON.stringify({ id: COPY, label: 'AppBar', fields: [] }),
    )
  })

  afterEach(async () => {
    running.forEach(({ child }) => child.kill('SIGKILL'))
    await Promise.all(running.map(({ exit }) => exit))
    await rm(root, { recursive: true, force: true })
  })

  it('names the relative file at the start, the absolute file after a copy, and each file once after a restart', async () => {
    const productCopy = path.join(product, 'definitions', 'zz-copy.json')
    const productLine = `wishem: warning in ${productCopy}: ${MESSAGE}`

    const first = start()
    await until(() => first.lines().some((line) => line.includes('link at')))
    expect(first.lines().slice(0, 5)).toEqual([
      `wishem: model ${model}`,
      `wishem: product ${product}`,
      modelLine,
      'wishem: 2 component types, 1 entity',
      'wishem: product: 1 component type, 1 entity',
    ])

    await copyFile(path.join(model, 'definitions', 'zz-copy.json'), productCopy)
    await until(() => warnings(first).length === 2)
    expect(warnings(first)).toEqual([modelLine, productLine])
    expect(first.lines().some((line) => line.startsWith('wishem: product: warning'))).toBe(false)

    await rm(productCopy)
    await pause(500)
    expect(warnings(first)).toHaveLength(2)

    await copyFile(path.join(model, 'definitions', 'zz-copy.json'), productCopy)
    await pause(500)
    first.child.kill('SIGINT')
    expect(await first.exit).toBe(0)

    const second = start()
    await until(() => second.lines().some((line) => line.includes('link at')))
    expect(warnings(second)).toEqual([modelLine, productLine])
    const index = (line: string) => second.lines().indexOf(line)
    expect(index(productLine)).toBeLessThan(index('wishem: 2 component types, 1 entity'))
    expect(index(modelLine)).toBeLessThan(index('wishem: 2 component types, 1 entity'))
  })
})
