import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { startWatch } from '../build/scripts.js'
import { createFakeServer } from '../docker/fake-server.test.helpers.js'
import { createOutputStream } from '../stream.js'
import { watchBuiltOutput } from '../watch/output-watcher.js'
import { createScratchWorkspace, scratchPack } from '../workspace.test.helpers.js'
import { destroy } from './destroy.js'
import { stop } from './stop.js'

import type { FakeServer } from '../docker/fake-server.test.helpers.js'
import type { CommandContext } from '../start/run.js'
import type { ScratchWorkspace } from '../workspace.test.helpers.js'

let scratch: ScratchWorkspace | undefined

afterEach(async () => {
  await scratch?.remove()
  scratch = undefined
})

const stand = async (options: {
  running?: boolean
  worlds?: readonly string[]
  interactive?: boolean
  answer?: boolean
}): Promise<{ context: CommandContext; server: FakeServer; lines: string[]; asked: string[] }> => {
  scratch = await createScratchWorkspace([scratchPack(1)])
  const server = createFakeServer({ image: 'itzg/minecraft-bedrock-server:latest', port: 19132, level: 'dev' })
  if (options.running !== false) {
    await server.up()
    server.put('/data/server.properties', 'level-name=dev\n')
    for (const world of options.worlds ?? ['dev', 'holiday']) {
      server.volume.dirs.add(`/data/worlds/${world}`)
    }
  }

  const lines: string[] = []
  const asked: string[] = []
  return {
    server,
    lines,
    asked,
    context: {
      cwd: scratch.root,
      stream: createOutputStream((line) => lines.push(line)),
      cli: { acceptEula: true },
      interactive: options.interactive ?? true,
      deps: {
        compose: (spec) => {
          server.setLevel(spec.level)
          return Promise.resolve(server)
        },
        confirm: (question) => {
          asked.push(question)
          return Promise.resolve(options.answer ?? true)
        },
      },
    },
  }
}

describe('stop', () => {
  // d-7ayy4btp — the world is written before the process goes down
  it('takes the server down through the console stop, waited for, never a kill', async () => {
    const { context, server } = await stand({})

    await stop(context)

    expect(server.operations).toContain('console stop')
    // the console stop comes first; the container comes down only once it has taken effect
    expect(server.operations.indexOf('console stop')).toBeLessThan(server.operations.indexOf('down'))
    expect(server.operations.some((operation) => operation.includes('kill'))).toBe(false)
  })

  // d-zo2yl18y — the volume outlives a stop
  it('leaves the volume standing, so every world survives to the next start', async () => {
    const { context, server } = await stand({})
    server.put('/data/worlds/dev/level.dat', 'world')

    await stop(context)

    expect(server.operations).toContain('down')
    expect(server.operations).not.toContain('down --volumes')
    expect(server.volume.files.get('/data/worlds/dev/level.dat')).toBe('world')
  })

  // d-62bpn2h2 — stop exits 0 on success
  it('exits 0 when the server was running and when it was not', async () => {
    const up = await stand({})
    await expect(stop(up.context)).resolves.toBeUndefined()

    const alreadyDown = await stand({ running: false })
    await expect(stop(alreadyDown.context)).resolves.toBeUndefined()
    expect(alreadyDown.lines.join('\n')).toContain('no server is running')
  })
})

describe('destroy', () => {
  // d-0yrfifhi — it names what it is about to remove and asks
  it('names the worlds it is about to remove and asks before removing them', async () => {
    const { context, lines, asked, server } = await stand({ worlds: ['dev', 'holiday'], answer: false })

    await destroy(context)

    expect(lines.join('\n')).toContain('dev')
    expect(lines.join('\n')).toContain('holiday')
    expect(asked).toHaveLength(1)
    expect(server.operations).not.toContain('down --volumes')
    expect(lines.join('\n')).toContain('nothing was removed')
  })

  // d-0yrfifhi — where nothing can be asked it does nothing
  it('does nothing where nothing can be asked', async () => {
    const { context, lines, asked, server } = await stand({ interactive: false })

    await destroy(context)

    expect(asked).toEqual([])
    expect(server.operations).not.toContain('down --volumes')
    expect(lines.join('\n')).toContain('nothing can be asked here')
  })

  // d-zo2yl18y — only destroy removes the volume
  it('removes the volume and every world on it once the author agrees', async () => {
    const { context, server } = await stand({ answer: true })
    server.put('/data/worlds/dev/level.dat', 'world')

    await destroy(context)

    expect(server.operations).toContain('down --volumes')
    expect(server.volume.files.size).toBe(0)
  })
})

describe('watching built output', () => {
  // d-j3ayhwv1 — the harness watches only the built output directories
  it("deploys on a debounced change to a selected pack's built output", async () => {
    const pack = scratchPack(1)
    scratch = await createScratchWorkspace([pack])
    const outputDir = scratch.outputDir(pack)
    const changes: ReadonlySet<string>[] = []
    const watcher = watchBuiltOutput([{ uuid: pack.uuid, outputDir }], (changed) => changes.push(changed), 40)

    try {
      await watcher.ready
      await writeFile(join(outputDir, 'scripts', 'main.js'), 'export const a = 1\n', 'utf8')
      await mkdir(join(outputDir, 'functions'), { recursive: true })
      await writeFile(join(outputDir, 'functions', 'hello.mcfunction'), 'say hi\n', 'utf8')

      await vi.waitFor(() => {
        expect(changes).toHaveLength(1)
      })
    } finally {
      await watcher.stop()
    }

    // one debounced report naming the pack, not one per file written
    expect([...changes[0]]).toEqual([pack.uuid])
  })

  // d-n81zkitr — a watch process that exits is reported and not restarted
  it('reports a watch process that exited and does not restart it', async () => {
    const pack = scratchPack(1)
    scratch = await createScratchWorkspace([pack])
    const dir = join(scratch.root, pack.dir)
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: pack.packageName, version: '1.0.0', scripts: { watch: 'node -e "process.exit(3)"' } }),
      'utf8',
    )
    const lines: string[] = []

    startWatch(
      dir,
      pack.packageName,
      'npm',
      createOutputStream((line) => lines.push(line)),
    )

    await vi.waitFor(
      () => {
        expect(lines.join('\n')).toContain('the watch exited')
      },
      { timeout: 20_000 },
    )
    expect(lines.filter((line) => line.includes('is not restarted'))).toHaveLength(1)
  }, 30_000)
})
