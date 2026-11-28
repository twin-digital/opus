// @vitest-environment node
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { timeInputs, TIME_ID } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent, JoinedState, RemoteLink } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HUB_PORT, SAMPLE_STEP_MS, startSampleConstruct } from './sample-construct.js'
import type { SampleConstruct } from './sample-construct.js'

const STATE_FILE = fileURLToPath(new URL('../../sample-product/model/state.json', import.meta.url))

const componentOf = (state: JoinedState, type: string, field: string) =>
  (state.store as { entities: { id: string; components: Record<string, Record<string, unknown>> }[] }).entities.find(
    (entity) => entity.id === SAMPLE_ENTITY,
  )?.components[type]?.[field]

const colorOf = (state: JoinedState) => componentOf(state, COLOR_TYPE, COLOR_FIELD)
const countOf = (state: JoinedState) => componentOf(state, COUNTER_TYPE, COUNT_FIELD)
const ticksOf = (state: JoinedState) => (state[TIME_ID] as TimePart).ticks

const until = async (check: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('startSampleConstruct', () => {
  const constructs: SampleConstruct[] = []
  const links: RemoteLink[] = []
  const blockers: Server[] = []

  afterEach(async () => {
    vi.useRealTimers()
    links.splice(0).forEach((link) => {
      link.close()
    })
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
    await Promise.all(blockers.splice(0).map((blocker) => new Promise((resolve) => blocker.close(resolve))))
  })

  const start = async (options: { paused?: boolean } = {}) => {
    const construct = await startSampleConstruct({ port: 0, ...options })
    constructs.push(construct)
    return construct
  }

  let clientCount = 0
  const open = async (construct: SampleConstruct) => {
    clientCount += 1
    const suffix = String(clientCount)
    const events: HubEvent[] = []
    const socket = new WebSocket(construct.linkUrl)
    const link = await openLink(await webSocketChannel(socket), [
      { id: `viewer-${suffix}`, kind: 'output' },
      { id: `keys-${suffix}`, kind: 'input' },
    ])
    links.push(link)
    const viewer = link.ports[`viewer-${suffix}`]
    viewer.subscribe((event) => {
      events.push(event)
    })
    return { link, events, viewer, keys: link.ports[`keys-${suffix}`] }
  }

  it('exports the default port and the step', () => {
    expect(DEFAULT_HUB_PORT).toBe(4750)
    expect(SAMPLE_STEP_MS).toBe(500)
  })

  it('gives the joined state at the start: tick 0, the first color, count 0', async () => {
    const construct = await start({ paused: true })
    const { viewer } = await open(construct)

    expect(construct.linkUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(ticksOf(viewer.read())).toBe(0)
    expect(colorOf(viewer.read())).toBe('#1d4ed8')
    expect(countOf(viewer.read())).toBe(0)
  })

  it('applies one time/advance from a client: the second color and count 1', async () => {
    const construct = await start({ paused: true })
    const { viewer, keys } = await open(construct)

    const result = await keys.submit(timeInputs.advance(SAMPLE_STEP_MS))

    expect(result.ok).toBe(true)
    expect(ticksOf(viewer.read())).toBe(1)
    expect(colorOf(viewer.read())).toBe('#b91c1c')
    expect(countOf(viewer.read())).toBe(1)
  })

  it('gives three clients the same applied event with the same seq', async () => {
    const construct = await start({ paused: true })
    const clients = [await open(construct), await open(construct), await open(construct)]

    await clients[0].keys.submit(timeInputs.advance(SAMPLE_STEP_MS))
    await until(() => clients.every((client) => client.events.some((event) => event.type === 'applied')))

    const applied = clients.map((client) => client.events.filter((event) => event.type === 'applied'))
    expect(applied.map((events) => events.length)).toEqual([1, 1, 1])
    expect(applied[1]).toEqual(applied[0])
    expect(applied[2]).toEqual(applied[0])
    expect(applied[0][0]).toMatchObject({ input: { seq: expect.any(Number) as number, type: 'time/advance' } })
  })

  it('sends one tick for each 500 ms of the clock', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const construct = await start()
    const { viewer } = await open(construct)

    vi.advanceTimersByTime(SAMPLE_STEP_MS - 1)
    await new Promise((resolve) => setImmediate(resolve))
    expect(ticksOf(viewer.read())).toBe(0)

    vi.advanceTimersByTime(1)
    await until(() => ticksOf(viewer.read()) === 1)
    expect(colorOf(viewer.read())).toBe('#b91c1c')
    expect(countOf(viewer.read())).toBe(1)
  })

  it('sends no tick while paused', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const construct = await start({ paused: true })
    const { viewer } = await open(construct)

    vi.advanceTimersByTime(SAMPLE_STEP_MS * 3)
    await new Promise((resolve) => setImmediate(resolve))

    expect((viewer.read()[TIME_ID] as TimePart).running).toBe(false)
    expect(ticksOf(viewer.read())).toBe(0)
  })

  it('rejects with EADDRINUSE when the port is in use', async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const port = (blocker.address() as { port: number }).port

    await expect(startSampleConstruct({ port })).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })

  it('gives the same promise from each call of close, and sends stopping', async () => {
    const construct = await start()
    const { viewer, link } = await open(construct)
    const events: HubEvent[] = []
    viewer.subscribe((event) => {
      events.push(event)
    })

    const first = construct.close()
    const second = construct.close()

    expect(second).toBe(first)
    await first
    await link.closed
    expect(events.some((event) => event.type === 'stopping')).toBe(true)
  })

  it('does not change state.json of the sample product', async () => {
    const before = await readFile(STATE_FILE, 'utf8')
    const construct = await start({ paused: true })
    const { keys } = await open(construct)
    await keys.submit(timeInputs.advance(SAMPLE_STEP_MS))
    await construct.close()

    expect(await readFile(STATE_FILE, 'utf8')).toBe(before)
  })
})
