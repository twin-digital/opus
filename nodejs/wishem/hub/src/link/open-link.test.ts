import { describe, expect, it, vi } from 'vitest'
import { InputRefusedError } from '../errors.js'
import { createHub } from '../hub.js'
import type { Hub, HubEvent, IoSubsystem, JoinedState, ModelSubsystem } from '../types.js'
import { createChannelPair, webSocketChannel } from './channel.js'
import type { Channel, WebSocketLike } from './channel.js'
import { LinkClosedError, LinkRefusedError, openLink } from './open-link.js'
import type { RemoteLink } from './open-link.js'
import { serveLink } from './serve-link.js'

const store: ModelSubsystem<{ fields: Record<string, string> }> = {
  id: 'store',
  inputs: ['store/set-field'],
  initial: { fields: {} },
  apply: (part, input) => {
    const { name, value } = input.payload as { name: string; value: string }
    return { fields: { ...part.fields, [name]: value } }
  },
}

const time: ModelSubsystem<{ ticks: number }> = {
  id: 'time',
  inputs: ['time/tick'],
  initial: { ticks: 0 },
  apply: (part) => ({ ticks: part.ticks + 1 }),
}

const picky: ModelSubsystem<{ count: number }> = {
  id: 'picky',
  inputs: ['picky/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    const { by } = input.payload as { by: number }
    if (by < 0) {
      throw new InputRefusedError([{ message: 'The number is negative.', path: ['payload', 'by'] }])
    }
    return { count: part.count + by }
  },
}

const boom: ModelSubsystem<null> = {
  id: 'boom',
  inputs: ['boom/go'],
  initial: null,
  apply: () => {
    throw new Error('It broke.')
  },
}

const settle = async () => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
  }
}

/** Tells at once if a promise has resolved. Does not wait for a promise that never resolves. */
const isResolved = async (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => true), settle().then(() => false)])

const page: IoSubsystem = { id: 'page', kind: 'output' }
const controls: IoSubsystem = { id: 'page-controls', kind: 'input' }
const setField = (name: string, value = '1') => ({ type: 'store/set-field', payload: { name, value } })

const makeHub = (models: ModelSubsystem[] = [store, time]) => {
  const hub = createHub({ subsystems: models })
  hub.start()
  return hub
}

const connectToHub = async (hub: Hub, subsystems: readonly IoSubsystem[] = [page, controls]) => {
  const [client, server] = createChannelPair()
  serveLink(hub, server)
  const link = await openLink(client, subsystems)
  return { link, client }
}

/** A client against a hub side that the test plays by hand. */
const connectRaw = async (
  subsystems: readonly IoSubsystem[] = [page, controls],
  welcome: { seq?: number; state?: JoinedState } = {},
  onError?: (error: unknown) => void,
) => {
  const [client, server] = createChannelPair()
  const sent: Record<string, unknown>[] = []
  const counts = { clientClose: 0, serverClosed: 0 }
  server.onMessage((text) => sent.push(JSON.parse(text) as Record<string, unknown>))
  server.onClose(() => counts.serverClosed++)
  const spy: Channel = {
    ...client,
    close: () => {
      counts.clientClose++
      client.close()
    },
  }
  const opening = openLink(spy, subsystems, { onError })
  await settle()
  const send = (message: unknown) => {
    server.send(typeof message === 'string' ? message : JSON.stringify(message))
  }
  send({
    t: 'welcome',
    protocol: 1,
    status: 'running',
    seq: welcome.seq ?? 0,
    state: welcome.state ?? { store: { fields: {} }, time: { ticks: 0 } },
  })
  const link = await opening
  sent.length = 0
  return { link, sent, send, counts, server }
}

const applied = (seq: number, parts: Record<string, unknown> = {}) => ({
  t: 'applied',
  input: { seq, source: 'other', type: 'x/y', payload: null },
  parts,
})

const throwValue = (value: unknown): never => {
  throw value
}

/** A channel that the test drives by calls. */
const manualChannel = () => {
  let deliver: (text: string) => void = () => undefined
  let closeListener: () => void = () => undefined
  const sent: string[] = []
  const state = { failSend: false, closes: 0 }
  const channel: Channel = {
    send: (text) => {
      if (state.failSend) {
        throw new Error('The channel is closed.')
      }
      sent.push(text)
    },
    onMessage: (listener) => {
      deliver = listener
    },
    onClose: (listener) => {
      closeListener = listener
    },
    close: () => {
      state.closes++
    },
  }
  return {
    channel,
    sent,
    state,
    deliver: (message: unknown) => {
      deliver(JSON.stringify(message))
    },
    close: () => {
      closeListener()
    },
  }
}

const welcomeMessage = { t: 'welcome', protocol: 1, status: 'running', seq: 0, state: { time: { ticks: 0 } } }

describe('the start of a link', () => {
  it('sends hello at once with the protocol version and the subsystems', async () => {
    const [client, server] = createChannelPair()
    const sent: unknown[] = []
    server.onMessage((text) => sent.push(JSON.parse(text)))
    void openLink(client, [page, controls]).catch(() => undefined)
    await settle()
    expect(sent).toEqual([
      {
        t: 'hello',
        protocol: 1,
        subsystems: [
          { id: 'page', kind: 'output' },
          { id: 'page-controls', kind: 'input' },
        ],
      },
    ])
  })

  it('closes the channel when the hub side refuses', async () => {
    const link = manualChannel()
    const opening = openLink(link.channel, [page])
    link.deliver({ t: 'refused', reason: 'id-in-use', message: 'No.' })
    await expect(opening).rejects.toBeInstanceOf(LinkRefusedError)
    expect(link.state.closes).toBe(1)
  })

  it('gives a frozen copy of the welcome state and a frozen list of ports', async () => {
    const state = { store: { fields: {} } }
    const { link } = await connectRaw([page], { state })
    expect(link.ports.page.read()).toEqual(state)
    expect(link.ports.page.read()).not.toBe(state)
    expect(Object.isFrozen(link.ports.page.read())).toBe(true)
    expect(Object.isFrozen(link.ports)).toBe(true)
  })

  it('resolves with a port for each subsystem when welcome arrives', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    expect(Object.keys(link.ports)).toEqual(['page', 'page-controls'])
    expect(link.ports.page.subsystem).toEqual(page)
    expect(link.ports.page.read()).toEqual(hub.read())
  })

  it('rejects an empty list of subsystems before it sends a message', async () => {
    const [client, server] = createChannelPair()
    const sent: unknown[] = []
    server.onMessage((text) => sent.push(text))
    await expect(openLink(client, [])).rejects.toThrow(Error)
    await settle()
    expect(sent).toEqual([])
  })

  it('rejects two subsystems with one ID before it sends a message', async () => {
    const [client, server] = createChannelPair()
    const sent: unknown[] = []
    server.onMessage((text) => sent.push(text))
    await expect(openLink(client, [page, { id: 'page', kind: 'input' }])).rejects.toThrow(Error)
    await settle()
    expect(sent).toEqual([])
  })

  it('rejects with a LinkRefusedError when the hub side refuses the hello', async () => {
    const [client, server] = createChannelPair()
    server.onMessage(() => {
      server.send(JSON.stringify({ t: 'refused', reason: 'version', message: 'No.', supported: [1] }))
    })
    const error = await openLink(client, [page]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LinkRefusedError)
    expect(error).toMatchObject({ reason: 'version', message: 'No.', supported: [1] })
  })

  it('rejects with a LinkRefusedError when a real hub refuses', async () => {
    const hub = makeHub()
    hub.attach({ id: 'page', kind: 'output' })
    const [client, server] = createChannelPair()
    serveLink(hub, server)
    const error = await openLink(client, [page]).catch((e: unknown) => e)
    expect(error).toMatchObject({ reason: 'id-in-use' })
  })

  it('rejects with a LinkClosedError when the channel closes before welcome', async () => {
    const [client, server] = createChannelPair()
    const opening = openLink(client, [page])
    server.close()
    await expect(opening).rejects.toBeInstanceOf(LinkClosedError)
  })

  it.each([
    ['an event message', { t: 'event', event: 'started' }],
    ['an unknown message', { t: 'future-thing' }],
    ['text that is not a message', 'not json'],
  ])('closes the channel and rejects when the first message is %s', async (_name, first) => {
    const [client, server] = createChannelPair()
    let closed = false
    server.onClose(() => (closed = true))
    const opening = openLink(client, [page])
    await settle()
    server.send(typeof first === 'string' ? first : JSON.stringify(first))
    await expect(opening).rejects.toBeInstanceOf(LinkClosedError)
    await settle()
    expect(closed).toBe(true)
  })

  it('resolves for a welcome that has a key named unknown', async () => {
    const manual = manualChannel()
    const opening = openLink(manual.channel, [page])
    manual.deliver({ ...welcomeMessage, unknown: true })
    const link = await opening
    expect(link.ports.page.read()).toEqual({ time: { ticks: 0 } })
  })

  it('closes the channel and rejects with a LinkClosedError for a welcome of a different protocol version', async () => {
    const manual = manualChannel()
    const opening = openLink(manual.channel, [page])
    manual.deliver({ ...welcomeMessage, protocol: 2 })
    await expect(opening).rejects.toBeInstanceOf(LinkClosedError)
    expect(manual.state.closes).toBe(1)
  })

  it('has a first expected sequence number of welcome.seq + 1', async () => {
    const { link, send, counts } = await connectRaw([page], { seq: 3 })
    send(applied(4))
    await settle()
    expect(counts.clientClose).toBe(0)
    void link
  })
})

describe('a remote port reads and listens', () => {
  it('gives the new part and the same object for a part that did not change', async () => {
    const { link, send } = await connectRaw()
    const before = link.ports.page.read()
    send(applied(1, { time: { ticks: 1 } }))
    await settle()
    const after = link.ports.page.read()
    expect(after.time).toEqual({ ticks: 1 })
    expect(after.store).toBe(before.store)
    expect(after).not.toBe(before)
    expect(Object.isFrozen(after)).toBe(true)
  })

  it('applies an applied message that has a key named unknown', async () => {
    const { link, send, counts } = await connectRaw()
    send({ ...applied(1, { time: { ticks: 1 } }), unknown: true })
    send(applied(2, { time: { ticks: 2 } }))
    await settle()
    expect(link.ports.page.read().time).toEqual({ ticks: 2 })
    expect(counts.clientClose).toBe(0)
  })

  it('updates the state before it calls the listeners of an applied event', async () => {
    const { link, send } = await connectRaw()
    const seen: unknown[] = []
    link.ports.page.subscribe((event) => {
      seen.push([event.type, link.ports.page.read().time])
    })
    send(applied(1, { time: { ticks: 1 } }))
    await settle()
    expect(seen).toEqual([['applied', { ticks: 1 }]])
  })

  it('gives started and stopping events to the listeners', async () => {
    const { link, send } = await connectRaw()
    const events: HubEvent[] = []
    link.ports.page.subscribe((event) => events.push(event))
    send({ t: 'event', event: 'started' })
    send({ t: 'event', event: 'stopping' })
    await settle()
    expect(events).toEqual([{ type: 'started' }, { type: 'stopping' }])
  })

  it('calls the ports in the order of the list and the listeners in the order of registration', async () => {
    const { link, send } = await connectRaw()
    const order: string[] = []
    link.ports['page-controls'].subscribe(() => order.push('controls-1'))
    link.ports.page.subscribe(() => order.push('page-1'))
    link.ports.page.subscribe(() => order.push('page-2'))
    link.ports['page-controls'].subscribe(() => order.push('controls-2'))
    send({ t: 'event', event: 'started' })
    await settle()
    expect(order).toEqual(['page-1', 'page-2', 'controls-1', 'controls-2'])
  })

  it('gives a frozen copy of the subsystem', async () => {
    const source = { id: 'page', kind: 'output' as const }
    const { link } = await connectRaw([source])
    expect(link.ports.page.subsystem).toEqual({ id: 'page', kind: 'output' })
    expect(link.ports.page.subsystem).not.toBe(source)
    expect(Object.isFrozen(link.ports.page.subsystem)).toBe(true)
  })

  it('counts one function that registers two times as two registrations', async () => {
    const { link, send } = await connectRaw()
    const listener = vi.fn()
    const first = link.ports.page.subscribe(listener)
    link.ports.page.subscribe(listener)
    send({ t: 'event', event: 'started' })
    await settle()
    expect(listener).toHaveBeenCalledTimes(2)
    first()
    send({ t: 'event', event: 'stopping' })
    await settle()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('does not call a listener that an earlier listener removes during the event', async () => {
    const { link, send } = await connectRaw([page])
    const later = vi.fn()
    let removeLater: () => void = () => undefined
    link.ports.page.subscribe(() => {
      removeLater()
    })
    removeLater = link.ports.page.subscribe(later)
    send({ t: 'event', event: 'started' })
    await settle()
    expect(later).not.toHaveBeenCalled()
  })

  it('does not call a listener that is added during the event until the next event', async () => {
    const { link, send } = await connectRaw([page])
    const added = vi.fn()
    let first = true
    link.ports.page.subscribe(() => {
      if (first) {
        first = false
        link.ports.page.subscribe(added)
      }
    })
    send({ t: 'event', event: 'started' })
    await settle()
    expect(added).not.toHaveBeenCalled()
    send({ t: 'event', event: 'stopping' })
    await settle()
    expect(added).toHaveBeenCalledTimes(1)
  })

  it('gives a frozen input to the listeners of an applied event', async () => {
    const { link, send } = await connectRaw([page])
    const events: HubEvent[] = []
    link.ports.page.subscribe((event) => events.push(event))
    send({ ...applied(1), input: { seq: 1, source: 'other', type: 'x/y', payload: { deep: { value: 1 } } } })
    await settle()
    const event = events[0]
    expect(event.type).toBe('applied')
    if (event.type === 'applied') {
      expect(Object.isFrozen(event.input)).toBe(true)
      expect(Object.isFrozen(event.input.payload)).toBe(true)
      expect(Object.isFrozen((event.input.payload as { deep: object }).deep)).toBe(true)
    }
  })

  it('keeps going when a listener throws, and gives the error to onError', async () => {
    const onError = vi.fn()
    const { link, send, counts } = await connectRaw([page, controls], {}, onError)
    const error = new Error('listener')
    const later = vi.fn()
    link.ports.page.subscribe(() => {
      throw error
    })
    link.ports.page.subscribe(later)
    link.ports['page-controls'].subscribe(later)
    send({ t: 'event', event: 'started' })
    send(applied(1))
    await settle()
    expect(later).toHaveBeenCalledTimes(4)
    expect(onError).toHaveBeenCalledWith(error)
    expect(counts.clientClose).toBe(0)
  })

  it('drops the error of a listener when there is no onError, or when onError throws', async () => {
    const { link, send } = await connectRaw([page], {}, () => {
      throw new Error('handler')
    })
    const later = vi.fn()
    link.ports.page.subscribe(() => {
      throw new Error('listener')
    })
    link.ports.page.subscribe(later)
    send({ t: 'event', event: 'started' })
    await settle()
    expect(later).toHaveBeenCalledTimes(1)

    const plain = await connectRaw([page])
    plain.link.ports.page.subscribe(() => {
      throw new Error('listener')
    })
    plain.send({ t: 'event', event: 'started' })
    await settle()
    expect(plain.counts.clientClose).toBe(0)
  })

  it('gives no event after port.close, and a second close does nothing', async () => {
    const { link, send } = await connectRaw()
    const listener = vi.fn()
    link.ports.page.subscribe(listener)
    link.ports.page.close()
    link.ports.page.close()
    send({ t: 'event', event: 'started' })
    await settle()
    expect(listener).not.toHaveBeenCalled()
    expect(link.ports.page.read()).toBeDefined()
  })

  it('gives not-permitted after port.close for an input port, with no message', async () => {
    const { link, sent } = await connectRaw()
    link.ports['page-controls'].close()
    const result = await link.ports['page-controls'].submit(setField('a'))
    await settle()
    expect(result).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(sent).toEqual([])
  })

  it('ignores a closed port, but the other ports still get events', async () => {
    const { link, send } = await connectRaw()
    const closedListener = vi.fn()
    const listener = vi.fn()
    link.ports.page.subscribe(closedListener)
    link.ports['page-controls'].subscribe(listener)
    link.ports.page.close()
    send({ t: 'event', event: 'started' })
    await settle()
    expect(closedListener).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('lets a listener call submit, port.close, and link.close during an event', async () => {
    const { link, send, sent, counts } = await connectRaw()
    const submitted: Promise<unknown>[] = []
    const failures: unknown[] = []
    const unsubscribed = vi.fn()
    link.ports['page-controls'].subscribe(() => {
      submitted.push(link.ports['page-controls'].submit(setField('a')).catch((e: unknown) => failures.push(e)))
    })
    link.ports.page.subscribe(() => {
      link.ports.page.close()
      unsubscribed()
    })
    send({ t: 'event', event: 'started' })
    await settle()
    expect(sent).toMatchObject([{ t: 'submit', request: 1 }])
    expect(unsubscribed).toHaveBeenCalledTimes(1)

    link.ports['page-controls'].subscribe(() => {
      link.close()
    })
    const after = vi.fn()
    link.ports['page-controls'].subscribe(after)
    send({ t: 'event', event: 'started' })
    await settle()
    expect(counts.clientClose).toBe(1)
    expect(after).not.toHaveBeenCalled()
    await expect(link.closed).resolves.toBeUndefined()
    await Promise.all(submitted)
    expect(failures[0]).toBeInstanceOf(LinkClosedError)
  })
})

describe('a remote port sends inputs', () => {
  it('gives the same result that a port of the hub gives', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    const result = await link.ports['page-controls'].submit(setField('a'))
    expect(result).toEqual({ ok: true, seq: 1 })
    expect(hub.record()[0]).toMatchObject({ source: 'page-controls', type: 'store/set-field' })
    expect(link.ports.page.read()).toEqual(hub.read())
  })

  it('gives the applied event before the result', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    const log: string[] = []
    link.ports.page.subscribe((event) => log.push(event.type))
    const result = await link.ports['page-controls'].submit(setField('a'))
    log.push(`result ${String((result as { seq: number }).seq)}`)
    expect(log).toEqual(['applied', 'result 1'])
  })

  it('numbers the requests from 1 and goes up by 1', async () => {
    const { link, sent } = await connectRaw()
    void link.ports['page-controls'].submit(setField('a'))
    void link.ports['page-controls'].submit(setField('b'))
    await settle()
    expect(sent.map((m) => m.request)).toEqual([1, 2])
    expect(sent[0]).toEqual({ t: 'submit', request: 1, subsystem: 'page-controls', input: setField('a') })
  })

  it('resolves each request with its own result', async () => {
    const { link, send } = await connectRaw()
    const first = link.ports['page-controls'].submit(setField('a'))
    const second = link.ports['page-controls'].submit(setField('b'))
    send({ t: 'result', request: 2, result: { ok: true, seq: 9 } })
    send({ t: 'result', request: 1, result: { ok: false, reason: 'invalid', problems: [] } })
    await expect(second).resolves.toEqual({ ok: true, seq: 9 })
    await expect(first).resolves.toEqual({ ok: false, reason: 'invalid', problems: [] })
  })

  it('resolves a request with a result that has a key named unknown', async () => {
    const { link, send } = await connectRaw()
    const request = link.ports['page-controls'].submit(setField('a'))
    send({ t: 'result', request: 1, result: { ok: true, seq: 9 }, unknown: true })
    await expect(request).resolves.toEqual({ ok: true, seq: 9 })
  })

  it('rejects with the error text when the result holds an error', async () => {
    const hub = makeHub([boom])
    const { link } = await connectToHub(hub)
    const failure = await link.ports['page-controls'].submit({ type: 'boom/go' }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('It broke.')
    expect(link.ports.page.read()).toEqual(hub.read())
  })

  it('ignores a result with an unknown request number', async () => {
    const { link, send, counts } = await connectRaw()
    send({ t: 'result', request: 77, result: { ok: true, seq: 1 } })
    await settle()
    expect(counts.clientClose).toBe(0)
    const pending = link.ports['page-controls'].submit(setField('a'))
    send({ t: 'result', request: 1, result: { ok: true, seq: 1 } })
    await expect(pending).resolves.toEqual({ ok: true, seq: 1 })
  })

  it('does not throw for a result with an unknown request number', () => {
    const link = manualChannel()
    void openLink(link.channel, [page, controls])
    link.deliver(welcomeMessage)
    expect(() => {
      link.deliver({ t: 'result', request: 77, result: { ok: true, seq: 1 } })
    }).not.toThrow()
  })

  it('gives not-permitted for an output port with no message', async () => {
    const { link, sent } = await connectRaw()
    const result = await link.ports.page.submit(setField('a'))
    await settle()
    expect(result).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(sent).toEqual([])
  })

  it('rejects with an Error for a payload that throws a value that is not an Error', async () => {
    const { link } = await connectRaw()
    const payload = {
      toJSON: () => throwValue('plain text'),
    }
    const failure = await link.ports['page-controls'].submit({ type: 'a/b', payload }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('plain text')
  })

  it('ends the link and rejects the request when the channel send throws', async () => {
    const manual = manualChannel()
    const opening = openLink(manual.channel, [page, controls])
    manual.deliver(welcomeMessage)
    const link = await opening
    manual.state.failSend = true
    await expect(link.ports['page-controls'].submit(setField('a'))).rejects.toBeInstanceOf(LinkClosedError)
    await link.closed
    expect(manual.state.closes).toBe(1)
  })

  it('rejects a payload that JSON cannot hold, and keeps the link', async () => {
    const { link, sent, counts } = await connectRaw()
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    await expect(link.ports['page-controls'].submit({ type: 'a/b', payload: cycle })).rejects.toThrow(Error)
    expect(sent).toEqual([])
    expect(counts.clientClose).toBe(0)
  })
})

describe('the end of a link', () => {
  it('ends when the channel closes, rejects a waiting submit, and keeps the last state', async () => {
    const { link, send, server, counts } = await connectRaw()
    send(applied(1, { time: { ticks: 1 } }))
    await settle()
    const waiting = link.ports['page-controls'].submit(setField('a'))
    const caught = waiting.catch((e: unknown) => e)
    server.close()
    await expect(link.closed).resolves.toBeUndefined()
    expect(await caught).toBeInstanceOf(LinkClosedError)
    expect(link.ports.page.read().time).toEqual({ ticks: 1 })
    expect(counts.clientClose).toBe(1)
  })

  it('gives not-running after the end, and sends no message', async () => {
    const { link, sent, server } = await connectRaw()
    server.close()
    await link.closed
    const result = await link.ports['page-controls'].submit(setField('a'))
    expect(result).toEqual({ ok: false, reason: 'not-running', problems: [] })
    expect(sent).toEqual([])
  })

  it('ends on link.close, closes the channel one time, and ignores a second close', async () => {
    const { link, counts, sent } = await connectRaw()
    link.close()
    link.close()
    await link.closed
    await settle()
    expect(counts.clientClose).toBe(1)
    expect(counts.serverClosed).toBe(1)
    expect(sent).toEqual([])
  })

  it('ends when a sequence number is not the last one plus 1', async () => {
    const { link, send, counts } = await connectRaw([page, controls], { seq: 4 })
    const listener = vi.fn()
    link.ports.page.subscribe(listener)
    const waiting = link.ports['page-controls'].submit(setField('a')).catch((e: unknown) => e)
    send(applied(6, { time: { ticks: 6 } }))
    await link.closed
    expect(counts.clientClose).toBe(1)
    expect(listener).not.toHaveBeenCalled()
    expect(link.ports.page.read().time).toEqual({ ticks: 0 })
    expect(await waiting).toBeInstanceOf(LinkClosedError)
  })

  it('ends when a sequence number repeats', async () => {
    const { link, send, counts } = await connectRaw()
    const listener = vi.fn()
    link.ports.page.subscribe(listener)
    send(applied(1, { time: { ticks: 1 } }))
    send(applied(1, { time: { ticks: 2 } }))
    await settle()
    expect(await isResolved(link.closed)).toBe(true)
    expect(counts.clientClose).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(link.ports.page.read().time).toEqual({ ticks: 1 })
  })

  it('resolves closed when the link ends, and not before', async () => {
    const { link, server } = await connectRaw()
    expect(await isResolved(link.closed)).toBe(false)
    server.close()
    expect(await isResolved(link.closed)).toBe(true)
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['an applied message with no parts', { t: 'applied', input: { seq: 1, source: 'a', type: 'b' } }],
    ['a message with no type', { x: 1 }],
  ])('ends when it gets %s', async (_name, message) => {
    const { link, send, counts } = await connectRaw()
    send(message)
    await link.closed
    expect(counts.clientClose).toBe(1)
  })

  it('ignores an unknown message type and keeps the link open', async () => {
    const { link, send, counts } = await connectRaw()
    send({ t: 'future-thing', x: 1 })
    send(applied(1, { time: { ticks: 1 } }))
    await settle()
    expect(counts.clientClose).toBe(0)
    expect(link.ports.page.read().time).toEqual({ ticks: 1 })
  })

  it('sends nothing more and gives no event after the end', async () => {
    const manual = manualChannel()
    const opening = openLink(manual.channel, [page, controls])
    manual.deliver(welcomeMessage)
    const link = await opening
    const listener = vi.fn()
    link.ports.page.subscribe(listener)
    const sentBefore = manual.sent.length
    link.close()
    manual.deliver(applied(1, { time: { ticks: 1 } }))
    manual.deliver({ t: 'event', event: 'stopping' })
    await settle()
    expect(listener).not.toHaveBeenCalled()
    expect(link.ports.page.read().time).toEqual({ ticks: 0 })
    expect(manual.sent).toHaveLength(sentBefore)
  })

  it('makes no stopping event when the link ends', async () => {
    const { link, server } = await connectRaw()
    const listener = vi.fn()
    link.ports.page.subscribe(listener)
    server.close()
    await link.closed
    expect(listener).not.toHaveBeenCalled()
  })

  it('ends after the stopping message of a real hub', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    const events: string[] = []
    link.ports.page.subscribe((event) => events.push(event.type))
    hub.stop()
    await link.closed
    expect(events).toEqual(['stopping'])
  })
})

describe('a link on a real hub', () => {
  it('carries the welcome state and each later event', async () => {
    const hub = makeHub()
    await hub.attach({ id: 'early', kind: 'input' }).submit(setField('a'))
    const { link } = await connectToHub(hub)
    expect(link.ports.page.read()).toEqual(hub.read())
    const events: HubEvent[] = []
    link.ports.page.subscribe((event) => events.push(event))
    await link.ports['page-controls'].submit({ type: 'time/tick' })
    expect(events).toMatchObject([{ type: 'applied', input: { seq: 2, type: 'time/tick' } }])
    expect(link.ports.page.read()).toEqual(hub.read())
    expect(link.ports.page.read().store).toBe(link.ports.page.read().store)
  })

  it('gets started when the hub starts after the link', async () => {
    const hub = createHub({ subsystems: [store] })
    const { link } = await connectToHub(hub)
    const events: HubEvent[] = []
    link.ports.page.subscribe((event) => events.push(event))
    hub.start()
    await settle()
    expect(events).toEqual([{ type: 'started' }])
  })

  it('frees the IDs when the link closes', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    link.close()
    await settle()
    await expect(connectToHub(hub)).resolves.toBeDefined()
  })
})

interface FakeSocket extends WebSocketLike {
  fire(type: string, event?: { data?: unknown }): void
}

const fakeSocketPair = (): [FakeSocket, FakeSocket] => {
  const make = (): FakeSocket & { peer?: FakeSocket } => {
    const listeners: Record<string, ((event: { data?: unknown }) => void)[]> = {}
    const socket: FakeSocket & { peer?: FakeSocket } = {
      readyState: 1,
      send: (data) => {
        const peer = socket.peer
        void Promise.resolve().then(() => peer?.fire('message', { data }))
      },
      close: () => {
        const peer = socket.peer
        void Promise.resolve().then(() => {
          socket.fire('close')
          peer?.fire('close')
        })
      },
      addEventListener: (type, listener) => {
        ;(listeners[type] ??= []).push(listener)
      },
      fire: (type, event = {}) => {
        for (const listener of listeners[type] ?? []) {
          listener(event)
        }
      },
    }
    return socket
  }
  const a = make()
  const b = make()
  a.peer = b
  b.peer = a
  return [a, b]
}

describe('the link on a WebSocket and in memory', () => {
  it('runs on channels in memory', async () => {
    const hub = makeHub()
    const { link } = await connectToHub(hub)
    expect(link.ports.page.read()).toEqual(hub.read())
  })

  it('runs on a WebSocket', async () => {
    const hub = makeHub()
    const [clientSocket, serverSocket] = fakeSocketPair()
    serveLink(hub, await webSocketChannel(serverSocket))
    const link: RemoteLink = await openLink(await webSocketChannel(clientSocket), [page, controls])
    const result = await link.ports['page-controls'].submit(setField('a'))
    expect(result).toEqual({ ok: true, seq: 1 })
    expect(link.ports.page.read()).toEqual(hub.read())
    link.close()
    await link.closed
  })
})

describe('the same behavior on two kinds of port', () => {
  interface Controls {
    settle: () => Promise<void>
    stop: () => void
  }

  const exercise = async (port: ReturnType<Hub['attach']>, { settle: wait, stop }: Controls) => {
    const events: unknown[] = []
    const states: unknown[] = []
    port.subscribe((event) => {
      events.push(event)
      states.push(port.read())
    })
    const results: unknown[] = []
    const inputs = [
      { type: 'picky/add', payload: { by: 2 } },
      { type: 'picky/add', payload: { by: 3 } },
      { type: 'picky/add', payload: { by: -1 } },
      { type: 'nothing/known' },
    ]
    for (const input of inputs) {
      results.push(await port.submit(input))
      await wait()
    }
    stop()
    await wait()
    results.push(await port.submit({ type: 'picky/add', payload: { by: 1 } }))
    return { subsystem: port.subsystem, results, events, states, final: port.read() }
  }

  it('gives equal results, events, and states', async () => {
    const hubA = makeHub([picky])
    const direct = await exercise(hubA.attach(controls), {
      settle,
      stop: () => {
        hubA.stop()
      },
    })

    const hubB = makeHub([picky])
    const { link } = await connectToHub(hubB, [controls])
    const remote = await exercise(link.ports['page-controls'], {
      settle,
      stop: () => {
        hubB.stop()
      },
    })

    expect(remote).toEqual(direct)
    expect(direct.results).toEqual([
      { ok: true, seq: 1 },
      { ok: true, seq: 2 },
      { ok: false, reason: 'invalid', problems: [{ message: 'The number is negative.', path: ['payload', 'by'] }] },
      { ok: false, reason: 'unknown-type', problems: [] },
      { ok: false, reason: 'not-running', problems: [] },
    ])
    expect(direct.events).toHaveLength(3)
  })
})
