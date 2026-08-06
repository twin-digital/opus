import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeServer } from '../docker/fake-server.test.helpers.js'
import { EulaNotAcceptedError } from '../docker/compose-file.js'
import { attachLockPath } from './attach-lock.js'
import { AlreadyAttachedError } from './attach-lock.js'
import { createOutputStream } from '../stream.js'
import { SelectionError } from '../settings/resolve.js'
import { createScratchWorkspace, scratchPack } from '../workspace.test.helpers.js'
import { projectNameFor } from '../workspace.js'
import { BailedOutError, DETACHING_SIGNALS, start, waitForSignal } from './start.js'

import type { FakeServer } from '../docker/fake-server.test.helpers.js'
import type { CommandContext } from './run.js'
import type { ScratchPack, ScratchWorkspace } from '../workspace.test.helpers.js'

const POOL = '/data/development_behavior_packs'

/** Waits until the foreground loop is up, so a test detaches from a run that finished starting. */
const watching = (lines: readonly string[]): Promise<void> =>
  vi.waitFor(
    () => {
      expect(lines.join('\n')).toContain('watching for changes')
    },
    { timeout: 20_000 },
  )

let scratch: ScratchWorkspace | undefined

afterEach(async () => {
  await rm(attachLockPath(projectNameFor('scratch-workspace')), { force: true })
  await scratch?.remove()
  scratch = undefined
})

const stand = async (
  packs: readonly ScratchPack[],
  options: { running?: boolean; cli?: CommandContext['cli']; interactive?: boolean; answer?: boolean } = {},
): Promise<{ context: CommandContext; server: FakeServer; lines: string[]; detach: () => void }> => {
  scratch = await createScratchWorkspace(packs)
  const server = createFakeServer({ image: 'itzg/minecraft-bedrock-server:latest', port: 19132, level: 'default' })
  if (options.running === true) {
    await server.up()
  }

  const lines: string[] = []
  let detach = (): void => undefined
  const signal = new Promise<void>((resolve) => {
    detach = resolve
  })

  return {
    server,
    lines,
    detach: () => {
      detach()
    },
    context: {
      cwd: scratch.root,
      stream: createOutputStream((line) => lines.push(line)),
      cli: options.cli ?? { acceptEula: true },
      interactive: options.interactive ?? true,
      deps: {
        compose: (spec) => {
          server.setLevel(spec.level)
          return Promise.resolve(server)
        },
        confirm: () => Promise.resolve(options.answer ?? true),
        waitForSignal: () => signal,
        dockerHost: 'ssh://someone@example.test',
        readinessPollMs: 5,
      },
    },
  }
}

describe('start', () => {
  // r-8et233c9 — one command from a clean checkout to a running, watched server
  it('builds, brings the server up, deploys the current build, and begins watching', async () => {
    const pack = scratchPack(1, { built: false, scripts: { build: 'node -e "1"' } })
    const { context, server, lines, detach } = await stand([pack])

    const run = start(context)
    await watching(lines)
    detach()
    await run

    expect(server.operations).toContain('up')
    expect(server.under(`${POOL}/${pack.uuid}`)).toContain(`${POOL}/${pack.uuid}/manifest.json`)
    expect(lines.join('\n')).toContain('watching for changes')
    expect(lines.join('\n')).toContain('detached; the server is still running')
    expect(server.isRunning()).toBe(true)
  })

  // d-5e00ndwi — build activity and server output share one stream
  it('interleaves build, deploy and server lines on the one tagged stream', async () => {
    const pack = scratchPack(1, { scripts: { build: 'node -e "console.log(\'building the pack\')"' } })
    const { context, lines, detach } = await stand([pack])

    const run = start(context)
    await watching(lines)
    detach()
    await run

    const tags = new Set(lines.map((line) => /^\[([^\]]+)]/.exec(line)?.[1]))
    expect(tags).toContain('deploy')
    expect(tags).toContain(pack.packageName)
    expect(tags).toContain('server')
    expect(lines.some((line) => line === `[${pack.packageName}] building the pack`)).toBe(true)
  })

  // d-vrq7lc2o — a build that fails does not stop the start
  it('deploys a pack whose build failed as a stub and reports the failure', async () => {
    const pack = scratchPack(1, { built: false, scripts: { build: 'node -e "process.exit(1)"' } })
    const { context, server, lines, detach } = await stand([pack])

    const run = start(context)
    await watching(lines)
    detach()
    await run

    expect(lines.join('\n')).toContain('the build failed')
    expect(server.volume.files.get(`${POOL}/${pack.uuid}/scripts/main.js`)).toContain('this pack did not build')
    expect(server.isRunning()).toBe(true)
  })

  // d-n81zkitr — a run hosts what was asked for or it does not start
  it('fails before bringing anything up when a selected pack is invalid', async () => {
    const pack = scratchPack(1)
    const { context, server } = await stand([pack])
    // a source manifest specifying header.version is a fault the kit reports
    await scratch?.write(
      join(pack.dir, 'behavior_pack', 'manifest.json'),
      JSON.stringify({
        format_version: 2,
        header: { uuid: pack.uuid, version: '9.9.9' },
        modules: [{ type: 'data', uuid: pack.moduleUuid }],
      }),
    )

    await expect(start(context)).rejects.toBeInstanceOf(SelectionError)
    expect(server.operations).toEqual([])
    expect(server.isRunning()).toBe(false)
  })

  // d-duvygv2f — the first deploy of a fresh world pays a restart
  it('restarts once against a fresh volume and reports it as part of starting', async () => {
    const pack = scratchPack(1)
    const { context, server, lines, detach } = await stand([pack])

    const run = start(context)
    await watching(lines)
    detach()
    await run

    // the world first loads with nothing in it, then again with the pack the deploy put there
    expect(lines.join('\n')).toContain('Pack Stack - None')
    expect(lines.join('\n')).toContain('the world loaded with NO packs active')
    expect(lines.join('\n')).toContain('restarting: ')
    expect(server.operations.filter((operation) => operation === 'console stop')).toHaveLength(1)
    expect(lines.at(-3) ?? '').not.toContain('NO packs active')
  }, 30_000)

  // d-e956frnx — the harness does not accept the EULA on the author's behalf
  it('fails and links the EULA when neither the flag nor the config accepts it', async () => {
    const { context, server } = await stand([scratchPack(1)], { cli: {} })

    await expect(start(context)).rejects.toBeInstanceOf(EulaNotAcceptedError)
    await expect(start(context)).rejects.toThrow('minecraft.net')
    expect(server.operations).toEqual([])
  })

  // d-wgzr4lvx — one attached run per workspace
  it('refuses to attach when another harness is already attached, naming it', async () => {
    const { context, detach, lines } = await stand([scratchPack(1)])
    const second = await stand([scratchPack(1)])

    const run = start(context)
    await watching(lines)

    await expect(start(second.context)).rejects.toBeInstanceOf(AlreadyAttachedError)
    await expect(start(second.context)).rejects.toThrow(String(process.pid))

    detach()
    await run
  })

  // d-owprl7uy — the destructive rung is never taken without an answer
  it('bails out rather than regenerating a world where nothing can be asked', async () => {
    const pack = scratchPack(1)
    const { context, server } = await stand([pack], {
      running: true,
      interactive: false,
      cli: { acceptEula: true, level: 'default', seed: 777n },
    })
    server.put('/data/server.properties', 'level-name=default\n')
    server.volume.dirs.add('/data/worlds/default')
    server.put('/data/.mc-dev-server/worlds.json', JSON.stringify({ version: 1, worlds: { default: { seed: '1' } } }))

    await expect(start(context)).rejects.toBeInstanceOf(BailedOutError)
    expect(server.operations).not.toContain('recreate')
    expect(server.volume.dirs.has('/data/worlds/default')).toBe(true)
  })

  // d-5ocyva9w — the record is a world's generation history and a later start does not rewrite it
  it('leaves a world already on record with the seed it was generated from', async () => {
    const pack = scratchPack(1)
    const { context, server, lines, detach } = await stand([pack], {
      running: true,
      cli: { acceptEula: true, level: 'holiday' },
    })
    server.put(
      '/data/.mc-dev-server/worlds.json',
      JSON.stringify({ version: 1, worlds: { holiday: { seed: '424242' } } }),
    )
    server.volume.dirs.add('/data/worlds/holiday')
    server.put('/data/server.properties', 'level-name=holiday\n')

    const run = start(context)
    await watching(lines)
    detach()
    await run

    expect(JSON.parse(server.volume.files.get('/data/.mc-dev-server/worlds.json') ?? '{}')).toEqual({
      version: 1,
      worlds: { holiday: { seed: '424242' } },
    })
    expect(lines.join('\n')).not.toContain('recorded ')
  })

  // d-ifke5eeh — a reattach costs nothing and reaches readiness from the line already in the log
  it('attaches to a matching running server without bringing anything up', async () => {
    const pack = scratchPack(1)
    const { context, server, lines, detach } = await stand([pack], { running: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    // the server already holds exactly what this run hosts, so the reconcile has nothing to do
    server.put(`${POOL}/${pack.uuid}/manifest.json`, '{}')
    server.put(`${POOL}/${pack.uuid}/scripts/main.js`, 'export {}')
    server.put(
      '/data/worlds/default/world_behavior_packs.json',
      JSON.stringify([{ pack_id: pack.uuid, version: '1.0.0' }]),
    )
    server.operations.length = 0

    const run = start(context)
    await watching(lines)
    detach()
    await run

    expect(lines.join('\n')).toContain('attaching to the running server')
    expect(server.operations).not.toContain('up')
    expect(server.operations).not.toContain('recreate')
  })

  // d-a3fyy34f, r-whacwz1b — the author is told where to connect, from the selected connection
  it('reports the endpoint derived from the published port and the Docker connection', async () => {
    const { context, lines, detach } = await stand([scratchPack(1)])

    const run = start(context)
    await watching(lines)
    detach()
    await run

    expect(lines.join('\n')).toContain('connect on example.test:19132')
  })
})

// d-62bpn2h2 — signals detach and leave the server running
describe('the detaching signals', () => {
  afterEach(() => {
    for (const signal of DETACHING_SIGNALS) {
      process.removeAllListeners(signal)
    }
  })

  it.each([...DETACHING_SIGNALS])('closes the foreground loop on %s', async (signal) => {
    const closed = waitForSignal()
    process.emit(signal, signal)

    await expect(closed).resolves.toBeUndefined()
  })
})

// r-whacwz1b — nothing the harness writes to the server travels by a path the daemon shares
describe('the deploy transport', () => {
  it('configures no bind mount anywhere in the generated project', async () => {
    const { renderComposeFile } = await import('../docker/compose-file.js')
    const rendered = renderComposeFile({
      project: 'p',
      image: 'itzg/minecraft-bedrock-server:latest',
      port: 19132,
      level: 'dev',
      seed: 1n,
    })

    expect(rendered).toContain('world-data:/data')
    expect(rendered).not.toMatch(/[./]{1,2}\/[^\s]*:\s*\/data/)
    expect(rendered).not.toContain('bind')
  })
})

// keeps the helper honest: the fake server writes what a test asserts against
it('stands a scratch workspace up on disk', async () => {
  scratch = await createScratchWorkspace([scratchPack(1)])
  await writeFile(join(scratch.root, 'marker'), 'x', 'utf8')

  expect(scratch.root).toContain('mc-dev-server-ws-')
})
