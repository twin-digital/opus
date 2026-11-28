import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { TIME_ID, timeInputs, type ClockTimer, type TimePart } from '@thrashplay/wishem-clock'
import type { Model } from '@thrashplay/wishem-core'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent, RemoteLink } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it } from 'vitest'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD, STEP_MS } from './model.js'
import { startPixiConstruct } from './process.js'
import type { PixiConstruct, PixiConstructOptions } from './process.js'

const colorOf = (part: unknown) => (part as Model).entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

/** A timer that the test calls. `fire` calls the last callback, also after the stop. */
const makeTimer = () => {
  let callback: (() => void) | undefined
  let starts = 0
  const timer: ClockTimer = {
    start: (next) => {
      callback = next
      starts += 1
      return () => undefined
    },
  }
  return {
    timer,
    fire: () => callback?.(),
    get starts() {
      return starts
    },
  }
}

const portOf = (construct: PixiConstruct) => Number(new URL(construct.url).port)

describe('startPixiConstruct', () => {
  let constructs: PixiConstruct[]
  let sockets: WebSocket[]
  let links: RemoteLink[]
  let blockers: ReturnType<typeof createServer>[]
  let clockTime: number
  let timer: ReturnType<typeof makeTimer>

  const setup = () => {
    constructs = []
    sockets = []
    links = []
    blockers = []
    clockTime = 1000
    timer = makeTimer()
  }

  const start = async (options: Partial<PixiConstructOptions> = {}) => {
    const construct = await startPixiConstruct({
      port: 0,
      timer: timer.timer,
      now: () => clockTime,
      log: () => undefined,
      ...options,
    })
    constructs.push(construct)
    return construct
  }

  const open = async (construct: PixiConstruct) => {
    const socket = new WebSocket(construct.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket), [
      { id: 'screen', kind: 'output' },
      { id: 'keys', kind: 'input' },
    ])
    links.push(link)
    const events: HubEvent[] = []
    link.ports.screen.subscribe((event) => {
      events.push(event)
    })
    return { link, events }
  }

  /** The clock calls the timer after 500 milliseconds of real time. */
  const step = () => {
    clockTime += STEP_MS
    timer.fire()
  }

  const ticksOf = (construct: PixiConstruct) => (construct.hub.read()[TIME_ID] as TimePart).ticks

  const appliedAdvances = (events: HubEvent[]) =>
    events.filter(
      (event) => event.type === 'applied' && event.input.type === 'time/advance' && event.input.source === 'clock',
    )

  afterEach(async () => {
    links.forEach((link) => {
      link.close()
    })
    sockets.forEach((socket) => {
      socket.close()
    })
    await Promise.all(constructs.map((construct) => construct.close()))
    await Promise.all(
      blockers.map(
        (blocker) =>
          new Promise<void>((resolve) =>
            blocker.close(() => {
              resolve()
            }),
          ),
      ),
    )
  })

  describe('the process', () => {
    it('gives a client the welcome with the parts time and store', async () => {
      setup()
      const construct = await start()
      expect(construct.linkUrl).toBe(`ws://127.0.0.1:${portOf(construct)}/link`)
      const { link } = await open(construct)
      expect(Object.keys(link.ports.screen.read()).sort()).toEqual(['store', 'time'])
    })

    it('runs next to a second construct, and each link gives its own joined state', async () => {
      setup()
      const first = await start()
      const second = await start({ timer: makeTimer().timer })
      expect(portOf(first)).not.toBe(portOf(second))
      const { link: firstLink } = await open(first)
      const { link: secondLink } = await open(second)
      await firstLink.ports.keys.submit(timeInputs.advance(STEP_MS))
      expect((firstLink.ports.screen.read()[TIME_ID] as TimePart).ticks).toBe(1)
      expect((secondLink.ports.screen.read()[TIME_ID] as TimePart).ticks).toBe(0)
    })

    it('starts at tick 0 with the first color and a running hub', async () => {
      setup()
      const construct = await start()
      expect(construct.hub.status).toBe('running')
      expect(ticksOf(construct)).toBe(0)
      expect(colorOf(construct.hub.read().store)).toBe(COLORS[0])
    })
  })

  describe('the clock', () => {
    it('sends one time/advance from the source clock after 500 ms, with the second color', async () => {
      setup()
      const construct = await start()
      const { link, events } = await open(construct)
      step()
      await eventually(() => appliedAdvances(events).length === 1)
      expect(ticksOf(construct)).toBe(1)
      expect(colorOf(link.ports.screen.read().store)).toBe(COLORS[1])
    })

    it('sends no tick before 500 ms of real time have passed', async () => {
      setup()
      const construct = await start()
      clockTime += STEP_MS - 1
      timer.fire()
      await settle()
      expect(ticksOf(construct)).toBe(0)
    })

    it('sends nothing while paused', async () => {
      setup()
      const construct = await start({ paused: true })
      const { events } = await open(construct)
      step()
      await settle()
      expect(appliedAdvances(events)).toHaveLength(0)
      expect(ticksOf(construct)).toBe(0)
    })

    it('starts with running set to false for the option paused', async () => {
      setup()
      const construct = await start({ paused: true })
      expect(construct.hub.read()[TIME_ID]).toMatchObject({ ticks: 0, running: false })
      await settle()
      expect(ticksOf(construct)).toBe(0)
    })

    it('starts with running set to true without the option paused', async () => {
      setup()
      const construct = await start()
      expect((construct.hub.read()[TIME_ID] as TimePart).running).toBe(true)
    })

    it('stops the ticks for time/set-running false from a client, and sends ticks again for true', async () => {
      setup()
      const construct = await start()
      const { link, events } = await open(construct)
      expect(await link.ports.keys.submit(timeInputs.setRunning(false))).toMatchObject({ ok: true })
      step()
      await settle()
      expect(appliedAdvances(events)).toHaveLength(0)
      expect(await link.ports.keys.submit(timeInputs.setRunning(true))).toMatchObject({ ok: true })
      step()
      await eventually(() => appliedAdvances(events).length === 1)
    })
  })

  describe('close', () => {
    it('gives the same promise on two calls', async () => {
      setup()
      const construct = await start()
      const first = construct.close()
      expect(construct.close()).toBe(first)
      await expect(first).resolves.toBeUndefined()
    })

    it('stops the hub and the clock, ends the link, and frees the port', async () => {
      setup()
      const construct = await start()
      const { link, events } = await open(construct)
      const port = portOf(construct)
      await construct.close()
      await link.closed
      expect(events.map(({ type }) => type)).toContain('stopping')
      expect(construct.hub.status).toBe('stopped')
      const seq = construct.hub.seq
      step()
      await settle()
      expect(construct.hub.seq).toBe(seq)
      const again = await start({ port })
      expect(portOf(again)).toBe(port)
    })

    it('closes the server and rejects when the stop of the clock throws', async () => {
      setup()
      const failing: ClockTimer = {
        start: () => () => {
          throw new Error('stop failed')
        },
      }
      const construct = await startPixiConstruct({ port: 0, timer: failing, log: () => undefined })
      const port = portOf(construct)
      await expect(construct.close()).rejects.toThrow('stop failed')
      const again = await start({ port })
      expect(portOf(again)).toBe(port)
    })

    it('causes no error and no later tick when a listener of the hub closes during a tick', async () => {
      setup()
      const errors: string[] = []
      const construct = await start({ log: (line) => errors.push(line) })
      let closing: Promise<void> | undefined
      const spy = construct.hub.attach({ id: 'spy', kind: 'output' })
      spy.subscribe((event) => {
        if (event.type === 'applied' && event.input.type === 'time/advance') {
          closing = construct.close()
        }
      })
      step()
      await eventually(() => closing !== undefined)
      await closing
      const seq = construct.hub.seq
      step()
      await settle()
      expect(construct.hub.seq).toBe(seq)
      expect(construct.hub.status).toBe('stopped')
      expect(errors).toEqual([])
    })

    it('starts a new construct at tick 0 with the first color after a close', async () => {
      setup()
      const first = await start()
      step()
      await eventually(() => ticksOf(first) === 1)
      await first.close()
      const second = await start()
      expect(ticksOf(second)).toBe(0)
      expect(colorOf(second.hub.read().store)).toBe(COLORS[0])
    })
  })

  describe('with a port in use', () => {
    it('rejects with EADDRINUSE and starts no clock', async () => {
      setup()
      const blocker = createServer()
      blockers.push(blocker)
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
      const { port } = blocker.address() as AddressInfo
      await expect(startPixiConstruct({ port, timer: timer.timer, log: () => undefined })).rejects.toMatchObject({
        code: 'EADDRINUSE',
      })
      expect(timer.starts).toBe(0)
      timer.fire()
    })
  })
})
