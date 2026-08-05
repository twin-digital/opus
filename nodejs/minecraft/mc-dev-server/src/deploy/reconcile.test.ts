import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createFakeServer } from '../docker/fake-server.test.helpers.js'
import { createOutputStream } from '../stream.js'
import { projectNameFor } from '../workspace.js'
import { createScratchWorkspace, scratchPack } from '../workspace.test.helpers.js'
import { createReconcileQueue, reconcileOnce } from './reconcile.js'

import type { FakeServer } from '../docker/fake-server.test.helpers.js'
import type { ScratchPack, ScratchWorkspace } from '../workspace.test.helpers.js'
import type { ReconcileContext } from './reconcile.js'

const LEVEL = 'dev'
const POOL = '/data/development_behavior_packs'
const ACTIVATION = `/data/worlds/${LEVEL}/world_behavior_packs.json`

let scratch: ScratchWorkspace | undefined

afterEach(async () => {
  await scratch?.remove()
  scratch = undefined
})

const stand = async (
  packs: readonly ScratchPack[],
): Promise<{ context: ReconcileContext; server: FakeServer; lines: string[]; restarts: () => number }> => {
  scratch = await createScratchWorkspace(packs)
  const server = createFakeServer({ image: 'itzg/minecraft-bedrock-server:latest', port: 19132, level: LEVEL })
  await server.up()
  const lines: string[] = []
  let restarts = 0

  const context: ReconcileContext = {
    workspace: { root: scratch.root, packageName: 'scratch-workspace', project: projectNameFor('scratch-workspace') },
    settings: { image: 'itzg/minecraft-bedrock-server:latest', port: 19132, eula: true },
    compose: server,
    stream: createOutputStream((line) => lines.push(line)),
    level: LEVEL,
    restart: {
      restart: () => {
        restarts += 1
        return Promise.resolve()
      },
    },
  }

  return { context, server, lines, restarts: () => restarts }
}

describe('the reconcile', () => {
  // d-3ya31m19 — five steps, in order
  it('discovers, reads the server, compares, applies, and brings the change live in that order', async () => {
    const pack = scratchPack(1)
    const { context, server, restarts } = await stand([pack])
    server.operations.length = 0

    const outcome = await reconcileOnce(context)

    const read = server.operations.indexOf('read')
    const copy = server.operations.findIndex((op) => op === `cp ${POOL}/${pack.uuid}`)
    const activation = server.operations.indexOf(`cp ${ACTIVATION}`)

    expect(read).toBeGreaterThanOrEqual(0)
    expect(read).toBeLessThan(copy)
    expect(copy).toBeLessThan(activation)
    // the change is brought live last, once every difference is applied
    expect(server.operations.at(-1)).toBe('cp /data/worlds/dev/world_resource_packs.json')
    expect(outcome.plan.apply).toBe('restart')
    expect(restarts()).toBe(1)
  })

  // d-3ya31m19 — a run with nothing to apply applies nothing and brings nothing live
  it('applies nothing and brings nothing live on a second run with no change', async () => {
    const { context, server, restarts } = await stand([scratchPack(1)])
    await reconcileOnce(context)
    server.operations.length = 0

    const outcome = await reconcileOnce(context)

    expect(outcome.plan).toMatchObject({ copy: [], remove: [], writeActivation: false, apply: 'none' })
    expect(server.operations.filter((op) => op !== 'read')).toEqual([])
    expect(restarts()).toBe(1)
  })

  // d-1u13wl57 — discovery runs at the head of every reconcile
  it('re-runs discovery on every reconcile, so a raised version reaches the next deploy', async () => {
    const pack = scratchPack(1, { version: '1.0.0' })
    const { context, server } = await stand([pack])
    await reconcileOnce(context)
    expect(JSON.parse(server.volume.files.get(ACTIVATION) ?? '[]')).toEqual([{ pack_id: pack.uuid, version: '1.0.0' }])

    const manifest = join(scratch?.root ?? '', pack.dir, 'package.json')
    await writeFile(manifest, (await readFile(manifest, 'utf8')).replace('1.0.0', '1.4.0'), 'utf8')
    await reconcileOnce(context)

    expect(JSON.parse(server.volume.files.get(ACTIVATION) ?? '[]')).toEqual([{ pack_id: pack.uuid, version: '1.4.0' }])
  })

  // d-q8ikxtdk — each reconcile reads live server state
  it('reads the pool and activation lists off the container rather than a record of them', async () => {
    const pack = scratchPack(1)
    const { context, server } = await stand([pack])
    await reconcileOnce(context)
    expect(server.under(`${POOL}/${pack.uuid}`)).not.toEqual([])

    // a hand edit on the container, which no record of the last deploy would show
    await server.exec(['rm', '-rf', `${POOL}/${pack.uuid}`])
    const outcome = await reconcileOnce(context)

    expect(outcome.plan.copy.map((entry) => entry.uuid)).toEqual([pack.uuid])
    expect(server.under(`${POOL}/${pack.uuid}`)).toContain(`${POOL}/${pack.uuid}/manifest.json`)
  })

  // d-n0dz38ky — a pool directory is replaced, not merged into
  it("removes a pack's pool directory before copying into it", async () => {
    const pack = scratchPack(1)
    const { context, server } = await stand([pack])
    await reconcileOnce(context)
    server.put(`${POOL}/${pack.uuid}/left-behind.json`, '{}')

    await reconcileOnce(context, new Set([pack.uuid]))

    expect(server.under(`${POOL}/${pack.uuid}`)).toEqual([
      `${POOL}/${pack.uuid}/manifest.json`,
      `${POOL}/${pack.uuid}/scripts/main.js`,
    ])
  })

  // d-plnvasfo — pool content the harness did not deploy is removed
  it('removes a pool directory the selection does not account for', async () => {
    const { context, server } = await stand([scratchPack(1)])
    server.put(`${POOL}/c0000000-0000-4000-8000-000000000000/manifest.json`, '{}')

    await reconcileOnce(context)

    expect(server.under(`${POOL}/c0000000-0000-4000-8000-000000000000`)).toEqual([])
  })

  // d-vrq7lc2o — a pack with nothing built is deployed as a stub
  it('deploys a pack with no built output as a stub and reports it', async () => {
    const pack = scratchPack(1, { built: false })
    const { context, server, lines } = await stand([pack])

    await reconcileOnce(context)

    expect(server.volume.files.get(`${POOL}/${pack.uuid}/scripts/main.js`)).toContain('this pack did not build')
    expect(lines.join('\n')).toContain('deployed as a stub')
  })

  // d-0qo3xvev — one at a time, and changes during one coalesce
  it('runs one reconcile at a time and coalesces the changes that arrive during one', async () => {
    const pack = scratchPack(1)
    const { context, server } = await stand([pack])
    await reconcileOnce(context)
    server.latencyMs = 5
    server.operations.length = 0

    const queue = createReconcileQueue(context)
    await Promise.all([queue.request([pack.uuid]), queue.request([pack.uuid]), queue.request([pack.uuid])])
    await queue.drain()

    // three requests, two reconciles: the one in flight, and the follow-up they coalesced into
    expect(server.operations.filter((op) => op === 'read')).toHaveLength(2)
  })

  // d-n81zkitr — a reconcile that throws changes nothing and is retried on the next save
  it('reports a reconcile that threw and leaves the server untouched', async () => {
    const pack = scratchPack(1)
    const { context, server, lines } = await stand([pack])
    await reconcileOnce(context)
    const before = server.under(POOL)
    server.operations.length = 0
    server.failReadsOnce()

    const queue = createReconcileQueue(context)
    await queue.request([pack.uuid])

    expect(lines.join('\n')).toContain('the deploy failed and changed nothing')
    expect(server.under(POOL)).toEqual(before)
    expect(server.operations.filter((op) => op.startsWith('cp '))).toEqual([])
  })
})
