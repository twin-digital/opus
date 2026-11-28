import { Container } from 'pixi.js'
import type { Sprite } from 'pixi.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectLink, createChannelPair, hubInputs, openLink, serveLink } from '@thrashplay/wishem-hub'
import type { Hub, Port, RemoteLink } from '@thrashplay/wishem-hub'
import { createPixiHub } from './construct/create-hub.js'
import { COLORS } from './construct/model.js'
import { startPixiConstruct } from './construct/process.js'
import type { PixiConstruct } from './construct/process.js'
import { startPage } from './page.js'
import type { PageLinkHandlers, PageOptions, PixiPage } from './page.js'
import type { LinkStatus } from './status.js'

const VIEWPORT = { width: 640, height: 360 }

const press = (target: EventTarget, key: string) => {
  target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }))
}

/** The sprite that the renderer made, or no value. */
const spriteOf = (stage: Container) => (stage.children[0] as Container | undefined)?.children[0] as Sprite | undefined

const tintOf = (stage: Container) => spriteOf(stage)?.tint

const hex = (color: string) => Number.parseInt(color.slice(1), 16)

describe('startPage', () => {
  const links: RemoteLink[] = []
  const hubs: Hub[] = []
  const pages: PixiPage[] = []
  const constructs: PixiConstruct[] = []

  afterEach(async () => {
    vi.useRealTimers()
    pages.splice(0).forEach((page) => {
      page.stop()
    })
    links.splice(0).forEach((link) => {
      link.close()
    })
    hubs.splice(0).forEach((hub) => {
      hub.stop()
    })
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
  })

  const makeHub = (running = false) => {
    const hub = createPixiHub({ running })
    hubs.push(hub)
    hub.start()
    return hub
  }

  /** The two ports of one link on a channel pair: the output port, then the input port. */
  const openPorts = async (hub: Hub, keysId = 'pixi-keys-test', screenId = `${keysId}-screen`) => {
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [
      { id: screenId, kind: 'output' },
      { id: keysId, kind: 'input' },
    ])
    links.push(link)
    return { link, ports: [link.ports[screenId], link.ports[keysId]] as const }
  }

  /** A page whose connector the test controls. */
  const makePage = (overrides: Partial<PageOptions> = {}) => {
    const stage = new Container()
    const keys = new EventTarget()
    const statuses: LinkStatus[] = []
    const errors: unknown[] = []
    const close = vi.fn()
    let handlers: PageLinkHandlers | undefined
    const page = startPage({
      stage,
      viewport: VIEWPORT,
      keys,
      connect: (given) => {
        handlers = given
        return { close }
      },
      onStatus: (status) => {
        statuses.push(status)
      },
      onError: (error) => {
        errors.push(error)
      },
      ...overrides,
    })
    pages.push(page)
    return {
      page,
      stage,
      keys,
      statuses,
      errors,
      close,
      handlers: () => {
        if (!handlers) {
          throw new Error('The page did not call connect.')
        }
        return handlers
      },
    }
  }

  it('shows connecting and draws nothing before the first link', () => {
    const { stage, statuses } = makePage()
    expect(statuses).toEqual([{ state: 'connecting' }])
    expect(stage.children).toHaveLength(0)
  })

  it('draws the color of the construct after the first link', async () => {
    const hub = makeHub()
    const { ports } = await openPorts(hub)
    const { stage, statuses, handlers } = makePage()

    handlers().onLink(ports)

    expect(statuses.at(-1)).toEqual({ state: 'connected', link: 1 })
    expect(tintOf(stage)).toBe(hex(COLORS[0]))
    expect(stage.children).toHaveLength(1)
  })

  it('follows the construct and sends the keys through the input port of the link', async () => {
    const hub = makeHub()
    const { ports } = await openPorts(hub)
    const { stage, keys, handlers } = makePage()
    handlers().onLink(ports)

    press(keys, '.')
    await vi.waitFor(() => {
      expect(tintOf(stage)).toBe(hex(COLORS[1]))
    })

    expect(hub.record().at(-1)).toMatchObject({ source: ports[1].subsystem.id, type: 'time/advance' })
  })

  it('pauses and runs through the space key', async () => {
    const hub = makeHub(true)
    const { ports } = await openPorts(hub)
    const { keys, handlers } = makePage()
    handlers().onLink(ports)

    press(keys, ' ')
    await vi.waitFor(() => {
      expect((hub.read().time as { running: boolean }).running).toBe(false)
    })
    press(keys, ' ')
    await vi.waitFor(() => {
      expect((hub.read().time as { running: boolean }).running).toBe(true)
    })
  })

  it('keeps the color and sends no key while the link is down', async () => {
    const hub = makeHub()
    const { link, ports } = await openPorts(hub)
    const { stage, keys, statuses, handlers } = makePage()
    handlers().onLink(ports)
    const before = hub.record().length

    link.close()
    handlers().onDown()
    press(keys, '.')
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(statuses.at(-1)).toEqual({ state: 'down', link: 1 })
    expect(tintOf(stage)).toBe(hex(COLORS[0]))
    expect(hub.record()).toHaveLength(before)
  })

  it('replaces the renderer and the input port on a second link', async () => {
    const hub = makeHub()
    const first = await openPorts(hub, 'pixi-keys-one')
    const { stage, keys, statuses, handlers } = makePage()
    handlers().onLink(first.ports)
    const oldRoot = stage.children[0]
    first.link.close()
    handlers().onDown()

    const second = await openPorts(hub, 'pixi-keys-two')
    handlers().onLink(second.ports)

    expect(oldRoot.destroyed).toBe(true)
    expect(stage.children).toHaveLength(1)
    expect(stage.children[0]).not.toBe(oldRoot)
    expect(statuses.at(-1)).toEqual({ state: 'connected', link: 2 })

    press(keys, '.')
    await vi.waitFor(() => {
      expect(hub.record().at(-1)).toMatchObject({ source: 'pixi-keys-two', type: 'time/advance' })
    })
  })

  it('draws the color of the target after a rewind from a different client', async () => {
    const hub = makeHub()
    const { ports } = await openPorts(hub)
    const { stage, keys, handlers } = makePage()
    handlers().onLink(ports)
    for (let step = 1; step <= 3; step += 1) {
      press(keys, '.')
      await vi.waitFor(() => {
        expect(hub.seq).toBe(step)
      })
    }
    await vi.waitFor(() => {
      expect(tintOf(stage)).toBe(hex(COLORS[3]))
    })

    const other = await openPorts(hub, 'rewinder')
    const result = await other.ports[1].submit(hubInputs.rewind(1))

    expect(result.ok).toBe(true)
    await vi.waitFor(() => {
      expect(tintOf(stage)).toBe(hex(COLORS[1]))
    })
  })

  it('reports an error of onStatus and goes on', async () => {
    const hub = makeHub()
    const { ports } = await openPorts(hub)
    const failure = new Error('status failed')
    const { stage, errors, handlers } = makePage({
      onStatus: () => {
        throw failure
      },
    })

    handlers().onLink(ports)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((error) => error === failure)).toBe(true)
    expect(tintOf(stage)).toBe(hex(COLORS[0]))
  })

  describe('stop', () => {
    it('closes the client, the ports, and the renderer, and sends no key', async () => {
      const hub = makeHub()
      const { ports } = await openPorts(hub)
      const closeSpies = ports.map((port) => vi.spyOn(port, 'close'))
      const { page, stage, keys, close, handlers } = makePage()
      handlers().onLink(ports)
      const before = hub.record().length

      page.stop()
      press(keys, '.')
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(close).toHaveBeenCalledTimes(1)
      closeSpies.forEach((spy) => {
        expect(spy).toHaveBeenCalled()
      })
      expect(stage.children).toHaveLength(0)
      expect(hub.record()).toHaveLength(before)
    })

    it('stops the page on pagehide, and removes the listener after a stop', () => {
      const lifecycle = new EventTarget()
      const first = makePage({ lifecycle })
      lifecycle.dispatchEvent(new Event('pagehide'))
      expect(first.close).toHaveBeenCalledTimes(1)

      const second = makePage({ lifecycle })
      second.page.stop()
      lifecycle.dispatchEvent(new Event('pagehide'))
      expect(second.close).toHaveBeenCalledTimes(1)
    })

    it('does nothing on a second call', async () => {
      const hub = makeHub()
      const { ports } = await openPorts(hub)
      const { page, close, handlers } = makePage()
      handlers().onLink(ports)

      page.stop()
      page.stop()

      expect(close).toHaveBeenCalledTimes(1)
    })

    it('starts no renderer when onStatus stops the page during onLink', async () => {
      const hub = makeHub()
      const { ports } = await openPorts(hub)
      const closeSpies = ports.map((port) => vi.spyOn(port, 'close'))
      const stopper: { page?: PixiPage } = {}
      const { page, stage, errors, handlers } = makePage({
        onStatus: (status) => {
          if (status.state === 'connected') {
            stopper.page?.stop()
          }
        },
      })
      stopper.page = page

      handlers().onLink(ports)

      expect(stage.children).toHaveLength(0)
      expect(errors).toEqual([])
      closeSpies.forEach((spy) => {
        expect(spy).toHaveBeenCalled()
      })
    })

    it('closes the ports and starts no renderer for a link after the stop', async () => {
      const hub = makeHub()
      const { ports } = await openPorts(hub)
      const closeSpies = ports.map((port) => vi.spyOn(port, 'close'))
      const { page, stage, statuses, handlers } = makePage()
      const count = statuses.length

      page.stop()
      handlers().onLink(ports)
      handlers().onDown()

      closeSpies.forEach((spy) => {
        expect(spy).toHaveBeenCalled()
      })
      expect(stage.children).toHaveLength(0)
      expect(statuses).toHaveLength(count)
    })
  })

  describe('with the real construct', () => {
    beforeEach(() => {
      vi.useRealTimers()
    })

    it('connects again after the construct stops and starts on the same port', async () => {
      const log = () => undefined
      const first = await startPixiConstruct({ port: 0, paused: true, log })
      const port = Number(new URL(first.linkUrl).port)
      let current: PixiConstruct | undefined = first
      constructs.push(first)

      const stage = new Container()
      const statuses: LinkStatus[] = []
      pages.push(
        startPage({
          stage,
          viewport: VIEWPORT,
          keys: new EventTarget(),
          connect: (handlers) =>
            connectLink({
              url: first.linkUrl,
              createSocket: (address) => new WebSocket(address),
              subsystems: [
                { prefix: 'pixi-screen', kind: 'output' },
                { prefix: 'pixi-keys', kind: 'input' },
              ],
              onLink: (ports) => {
                handlers.onLink(ports)
              },
              onDown: () => {
                handlers.onDown()
              },
            }),
          onStatus: (status) => {
            statuses.push(status)
          },
        }),
      )

      await vi.waitFor(() => {
        expect(statuses.at(-1)).toEqual({ state: 'connected', link: 1 })
      })
      expect(tintOf(stage)).toBe(hex(COLORS[0]))

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await current.close()
      await vi.waitFor(() => {
        expect(statuses.at(-1)).toEqual({ state: 'down', link: 1 })
      })
      expect(tintOf(stage)).toBe(hex(COLORS[0]))

      current = await startPixiConstruct({ port, paused: true, log })
      constructs.push(current)
      await vi.advanceTimersByTimeAsync(500)
      await vi.waitFor(() => {
        expect(statuses.at(-1)).toEqual({ state: 'connected', link: 2 })
      })

      expect(tintOf(stage)).toBe(hex(COLORS[0]))
      expect(stage.children).toHaveLength(1)
    })
  })
})
