import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(packageRoot, 'dist', 'cli.js')

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

interface Run {
  child: ChildProcess
  stdout: () => string
  stderr: () => string
  exit: Promise<number | null>
}

const run = (args: string[]): Run => {
  const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const exit = new Promise<number | null>((resolve) => child.on('close', resolve))
  return { child, stdout: () => out, stderr: () => err, exit }
}

const until = async (check: () => boolean, ms = 5000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('wishem command', () => {
  let folder: string
  let running: Run[]

  const start = (args: string[]) => {
    const process_ = run(args)
    running.push(process_)
    return process_
  }

  beforeEach(async () => {
    running = []
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-cli-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(
      path.join(folder, 'definitions', `${CT}.json`),
      JSON.stringify({ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }),
    )
    await writeFile(
      path.join(folder, 'state.json'),
      JSON.stringify({ entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }] }),
    )
  })

  afterEach(async () => {
    running.forEach(({ child }) => child.kill('SIGKILL'))
    await Promise.all(running.map(({ exit }) => exit))
    await rm(folder, { recursive: true, force: true })
  })

  it('prints the address of a correct model and keeps running', async () => {
    const process_ = start(['start', folder, '--port', '0'])
    await until(() => process_.stdout().includes('snapshot at'))
    expect(process_.stdout()).toContain(`wishem: model ${folder}`)
    expect(process_.stdout()).toContain('wishem: 1 component type, 1 entity')
    const url = /snapshot at (\S+)/.exec(process_.stdout())?.[1] ?? ''
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/snapshot$/)
    const response = await fetch(url)
    expect(((await response.json()) as { entities: unknown[] }).entities).toHaveLength(1)
  })

  it('exits with code 0 after an interrupt signal', async () => {
    const process_ = start(['start', folder, '--port', '0'])
    await until(() => process_.stdout().includes('snapshot at'))
    process_.child.kill('SIGINT')
    expect(await process_.exit).toBe(0)
  })

  it('uses the default port 4747 and --port to select another port', async () => {
    const selected = start(['start', folder, '--port', '0'])
    await until(() => selected.stdout().includes('snapshot at') || selected.stderr() !== '')
    expect(selected.stdout()).not.toContain(':4747/')
    // Port 4747 can be in use on a development computer, so the test accepts both outcomes.
    const defaults = start(['start', folder])
    await until(() => defaults.stdout().includes('snapshot at') || defaults.stderr().includes('in use'))
    if (defaults.stdout().includes('snapshot at')) {
      expect(defaults.stdout()).toContain('http://127.0.0.1:4747/snapshot')
    }
  })

  it('exits with code 1 and names the file for a model that is not correct', async () => {
    await writeFile(path.join(folder, 'state.json'), '{')
    const process_ = start(['start', folder, '--port', '0'])
    expect(await process_.exit).toBe(1)
    expect(process_.stderr()).toContain('problem in state.json')
    expect(process_.stdout()).not.toContain('snapshot at')
  })

  it('exits with code 1 when the folder does not exist', async () => {
    const process_ = start(['start', path.join(folder, 'nope')])
    expect(await process_.exit).toBe(1)
    expect(process_.stderr()).toContain('nope')
  })

  it('exits with code 1 and says that the port is in use', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const address = blocker.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const process_ = start(['start', folder, '--port', String(port)])
    expect(await process_.exit).toBe(1)
    expect(process_.stderr()).toContain(`port ${port} is in use`)
    await new Promise((resolve) => blocker.close(resolve))
  })

  it('prints the usage and exits with a non-zero code when no folder is given', async () => {
    const process_ = start(['start'])
    expect(await process_.exit).not.toBe(0)
    expect(process_.stderr()).toContain('usage: wishem start <folder> [--port <number>]')
  })

  it.each(['', '0x10', '1e3', ' 5000 ', '70000', '-1'])(
    'prints the usage and exits with a non-zero code for --port "%s"',
    async (value) => {
      const process_ = start(['start', folder, '--port', value])
      expect(await process_.exit).not.toBe(0)
      expect(process_.stderr()).toContain('usage: wishem start <folder> [--port <number>]')
      expect(process_.stdout()).not.toContain('snapshot at')
    },
  )

  it('shows a problem during a run, and that the model is correct again', async () => {
    const process_ = start(['start', folder, '--port', '0'])
    await until(() => process_.stdout().includes('snapshot at'))
    await writeFile(path.join(folder, 'state.json'), '{')
    await until(() => process_.stdout().includes('problem in state.json'))
    expect(process_.stdout()).toContain('wishem: the last correct snapshot stays')
    await writeFile(
      path.join(folder, 'state.json'),
      JSON.stringify({ entities: [{ id: E, components: { [CT]: { [FLD]: 'Again' } } }] }),
    )
    await until(() => process_.stdout().includes('wishem: the model is correct: 1 component type, 1 entity'))
  })
})
