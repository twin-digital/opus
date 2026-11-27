import { describe, expect, it, vi } from 'vitest'
import { createHub } from '../hub.js'
import type { Hub, IoSubsystem, ModelSubsystem, Port } from '../types.js'
import { createChannelPair } from './channel.js'
import type { Channel } from './channel.js'
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

const boom: ModelSubsystem<null> = {
  id: 'boom',
  inputs: ['boom/go'],
  initial: null,
  apply: () => {
    throw new Error('It broke.')
  },
}

const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}

const hello = (...subsystems: IoSubsystem[]) => ({ t: 'hello', protocol: 1, subsystems })
const page = { id: 'page', kind: 'output' } as const
const controls = { id: 'page-controls', kind: 'input' } as const
const keyboard = { id: 'keyboard', kind: 'input' } as const
const setField = (name: string, value = '1') => ({ type: 'store/set-field', payload: { name, value } })

const makeHub = (models: ModelSubsystem[] = [store, time], start = true) => {
  const hub = createHub({ subsystems: models })
  if (start) {
    hub.start()
  }
  return hub
}

const connect = (hub: Hub) => {
  const [client, server] = createChannelPair()
  serveLink(hub, server)
  const messages: Record<string, unknown>[] = []
  let closed = false
  client.onMessage((text) => messages.push(JSON.parse(text) as Record<string, unknown>))
  client.onClose(() => {
    closed = true
  })
  return {
    send: (message: unknown) => {
      client.send(typeof message === 'string' ? message : JSON.stringify(message))
    },
    messages,
    isClosed: () => closed,
    close: () => {
      client.close()
    },
  }
}

const joined = async (hub: Hub, ...subsystems: IoSubsystem[]) => {
  const link = connect(hub)
  link.send(hello(...subsystems))
  await settle()
  expect(link.messages[0]?.t).toBe('welcome')
  return link
}

describe('a message that is not correct', () => {
  it.each([
    ['text that is not JSON', 'nope'],
    ['a JSON array', '[]'],
    ['an object with no t', '{"protocol":1}'],
    ['a t that is not text', '{"t":1}'],
  ])('refuses %s with malformed and closes', async (_name, text) => {
    const link = connect(makeHub())
    link.send(text)
    await settle()
    expect(link.messages).toHaveLength(1)
    expect(link.messages[0]).toMatchObject({ t: 'refused', reason: 'malformed' })
    expect(typeof link.messages[0]?.message).toBe('string')
    expect(link.isClosed()).toBe(true)
  })

  it('refuses a submit as the first message', async () => {
    const link = connect(makeHub())
    link.send({ t: 'submit', request: 1, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'malformed' })])
    expect(link.isClosed()).toBe(true)
  })

  it('refuses a message with an unknown type as the first message', async () => {
    const link = connect(makeHub())
    link.send({ t: 'future-thing' })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'malformed' })])
    expect(link.isClosed()).toBe(true)
  })

  it('refuses a known type with a missing key after the start, and frees the IDs', async () => {
    const hub = makeHub()
    const link = await joined(hub, page, keyboard)
    link.send({ t: 'submit', request: 1, subsystem: 'keyboard' })
    await settle()
    expect(link.messages[1]).toMatchObject({ t: 'refused', reason: 'malformed' })
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
  })

  it('refuses a second hello, closes the link, and frees the IDs', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    link.send(hello(controls))
    await settle()
    expect(link.messages).toHaveLength(2)
    expect(link.messages[1]).toMatchObject({ t: 'refused', reason: 'malformed' })
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
    expect(() => hub.attach(controls)).not.toThrow()
  })
})

describe('a message with an unknown type after the start', () => {
  it.each(['future-thing', 'apply', 'part', 'welcome'])('ignores "%s" and keeps the link open', async (type) => {
    const hub = makeHub()
    const link = await joined(hub, page, keyboard)
    link.send({ t: type, x: 1 })
    await settle()
    expect(link.isClosed()).toBe(false)
    expect(link.messages).toHaveLength(1)
    link.send({ t: 'submit', request: 1, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(link.messages.map((m) => m.t)).toEqual(['welcome', 'applied', 'result'])
  })
})

describe('the hello message', () => {
  it('attaches the subsystems and sends one welcome', async () => {
    const hub = makeHub()
    const link = connect(hub)
    link.send(hello(page, controls))
    await settle()
    expect(link.messages).toEqual([
      {
        t: 'welcome',
        protocol: 1,
        status: 'running',
        seq: 0,
        state: { store: { fields: {} }, time: { ticks: 0 } },
      },
    ])
    expect(() => hub.attach(page)).toThrow()
    expect(() => hub.attach(controls)).toThrow()
  })

  it('puts the status created in the welcome and sends the started event later', async () => {
    const hub = makeHub([store, time], false)
    const link = await joined(hub, page)
    expect(link.messages[0]).toMatchObject({ status: 'created', seq: 0 })
    hub.start()
    await settle()
    expect(link.messages[1]).toEqual({ t: 'event', event: 'started' })
  })

  it('holds the sequence number and the state after three inputs', async () => {
    const hub = makeHub()
    const input = hub.attach(keyboard)
    await input.submit(setField('a', '1'))
    await input.submit(setField('b', '2'))
    await input.submit({ type: 'time/tick' })
    const link = await joined(hub, page)
    expect(link.messages[0]).toEqual({
      t: 'welcome',
      protocol: 1,
      status: 'running',
      seq: 3,
      state: { store: { fields: { a: '1', b: '2' } }, time: { ticks: 1 } },
    })
    await input.submit({ type: 'time/tick' })
    await settle()
    expect(link.messages[1]).toMatchObject({ t: 'applied', input: { seq: 4 } })
  })

  it('sends no started event for a hub that already started', async () => {
    const link = await joined(makeHub(), page)
    await settle()
    expect(link.messages).toHaveLength(1)
  })

  it('sends the events that the hub emits while the welcome is sent after the welcome', async () => {
    const hub = makeHub()
    const input = hub.attach(keyboard)
    const sent: string[] = []
    let deliver: ((text: string) => void) | undefined
    const channel: Channel = {
      send: (text) => {
        sent.push(text)
        if (sent.length === 1) {
          void input.submit({ type: 'time/tick' })
        }
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: () => undefined,
      close: () => undefined,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page)))
    await settle()
    expect(sent.map((text) => (JSON.parse(text) as { t: string }).t)).toEqual(['welcome', 'applied'])
    expect(JSON.parse(sent[1])).toMatchObject({ input: { seq: 1 }, parts: { time: { ticks: 1 } } })
  })
})

describe('the order of the welcome', () => {
  it('sends the welcome before an event that the hub emits while it sends the welcome', async () => {
    const hub = makeHub()
    const input = hub.attach(keyboard)
    const sent: string[] = []
    let deliver: ((text: string) => void) | undefined
    let first = true
    const channel: Channel = {
      send: (text) => {
        if (first) {
          first = false
          void input.submit({ type: 'time/tick' })
        }
        sent.push(text)
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: () => undefined,
      close: () => undefined,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page)))
    await settle()
    expect(sent.map((text) => (JSON.parse(text) as { t: string }).t)).toEqual(['welcome', 'applied'])
  })
})

describe('a stop during the welcome', () => {
  it('sends the stopping event after the welcome and closes the channel', () => {
    const hub = makeHub()
    const sent: string[] = []
    let deliver: ((text: string) => void) | undefined
    const close = vi.fn()
    const channel: Channel = {
      send: (text) => {
        sent.push(text)
        if (sent.length === 1) {
          hub.stop()
        }
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: () => undefined,
      close,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page)))
    expect(sent.map((text) => (JSON.parse(text) as { t: string }).t)).toEqual(['welcome', 'event'])
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('a hello that the hub side refuses', () => {
  it('refuses a newer protocol and lists the supported versions', async () => {
    const hub = makeHub()
    const link = connect(hub)
    link.send({ ...hello(page), protocol: 2 })
    await settle()
    expect(link.messages).toEqual([
      expect.objectContaining({ t: 'refused', reason: 'version', supported: [1], message: expect.any(String) }),
    ])
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
  })

  it('attaches none of the subsystems when one ID is in use', async () => {
    const hub = makeHub()
    hub.attach(keyboard)
    const link = connect(hub)
    link.send(hello(page, keyboard))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'id-in-use' })])
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
  })

  it('refuses an ID that is the ID of a model subsystem', async () => {
    const link = connect(makeHub())
    link.send(hello({ id: 'store', kind: 'output' }))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ reason: 'id-in-use' })])
  })

  it('refuses an ID that two subsystems of the hello share and attaches none', async () => {
    const hub = makeHub()
    const link = connect(hub)
    link.send(hello(page, { id: 'page', kind: 'input' }))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ reason: 'id-in-use' })])
    expect(() => hub.attach(page)).not.toThrow()
  })

  it('refuses a subsystem of the kind model with unsupported', async () => {
    const hub = makeHub()
    const link = connect(hub)
    link.send(hello(page, { id: 'physics', kind: 'model' } as unknown as IoSubsystem))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ reason: 'unsupported' })])
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
  })

  it.each([
    ['an empty list', []],
    ['a kind that is not known', [{ id: 'page', kind: 'robot' }]],
    ['an ID with an incorrect form', [{ id: 'Not Correct', kind: 'input' }]],
    ['an empty ID', [{ id: '', kind: 'input' }]],
  ])('refuses %s with malformed', async (_name, subsystems) => {
    const link = connect(makeHub())
    link.send({ t: 'hello', protocol: 1, subsystems })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'malformed' })])
    expect(link.isClosed()).toBe(true)
  })

  it('refuses a hello with a key that is missing', async () => {
    const link = connect(makeHub())
    link.send({ t: 'hello', protocol: 1 })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ reason: 'malformed' })])
  })

  it('refuses a hub that is stopped', async () => {
    const hub = makeHub()
    hub.stop()
    const link = connect(hub)
    link.send(hello(page))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'stopped' })])
    expect(link.isClosed()).toBe(true)
  })

  it('refuses an older protocol version', async () => {
    const link = connect(makeHub())
    link.send({ ...hello(page), protocol: 0 })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'version', supported: [1] })])
  })

  it('checks the status of the hub before the list of subsystems', async () => {
    const hub = makeHub()
    hub.stop()
    const link = connect(hub)
    link.send({ t: 'hello', protocol: 1, subsystems: [] })
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'stopped' })])
  })

  it('refuses with stopped when an attach fails with an error that is not a configuration error', async () => {
    const hub = makeHub()
    const failing: Hub = {
      get status() {
        return hub.status
      },
      start: () => {
        hub.start()
      },
      stop: () => {
        hub.stop()
      },
      read: () => hub.read(),
      record: () => hub.record(),
      attach: () => {
        throw new Error('The hub failed.')
      },
    }
    const link = connect(failing)
    link.send(hello(page))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'stopped' })])
  })

  it('closes the ports that it attached when one attach fails with a different error', async () => {
    const hub = makeHub()
    const closes: ReturnType<typeof vi.fn>[] = []
    let count = 0
    const wrapped: Hub = {
      get status() {
        return hub.status
      },
      start: () => {
        hub.start()
      },
      stop: () => {
        hub.stop()
      },
      read: () => hub.read(),
      record: () => hub.record(),
      attach: (subsystem) => {
        count += 1
        if (count === 2) {
          throw new Error('The hub failed.')
        }
        const port = hub.attach(subsystem)
        const close = vi.fn(() => {
          port.close()
        })
        closes.push(close)
        return { ...port, close }
      },
    }
    const link = connect(wrapped)
    link.send(hello(page, controls))
    await settle()
    expect(link.messages).toEqual([expect.objectContaining({ t: 'refused' })])
    expect(closes).toHaveLength(1)
    expect(closes[0]).toHaveBeenCalledTimes(1)
    expect(() => hub.attach(page)).not.toThrow()
  })
})

describe('the events of the hub', () => {
  it('sends one applied message for a link with two subsystems', async () => {
    const hub = makeHub()
    const link = await joined(hub, page, controls)
    await hub.attach(keyboard).submit({ type: 'time/tick' })
    await settle()
    expect(link.messages.filter((m) => m.t === 'applied')).toHaveLength(1)
  })

  it('sends the stopping event and then closes the connection', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    hub.stop()
    await settle()
    expect(link.messages[1]).toEqual({ t: 'event', event: 'stopping' })
    expect(link.messages).toHaveLength(2)
    expect(link.isClosed()).toBe(true)
  })

  it('holds the input and only the part that changed in an applied message', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    await hub.attach(keyboard).submit({ type: 'time/tick' })
    await settle()
    expect(link.messages[1]).toEqual({
      t: 'applied',
      input: { seq: 1, source: 'keyboard', type: 'time/tick', payload: null },
      parts: { time: { ticks: 1 } },
    })
    expect('store' in (link.messages[1]?.parts as object)).toBe(false)
  })

  it('compares each applied message with the last state that it sent', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    const input = hub.attach(keyboard)
    await input.submit(setField('a'))
    await input.submit({ type: 'time/tick' })
    await settle()
    expect(link.messages[1]).toMatchObject({ parts: { store: { fields: { a: '1' } } } })
    expect(Object.keys(link.messages[2]?.parts as object)).toEqual(['time'])
  })
})

describe('the submit message', () => {
  it('records the source and sends the applied message before the result', async () => {
    const hub = makeHub()
    const link = await joined(hub, page, keyboard)
    link.send({ t: 'submit', request: 7, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(hub.record().map((r) => r.source)).toEqual(['keyboard'])
    expect(link.messages.map((m) => m.t)).toEqual(['welcome', 'applied', 'result'])
    expect(link.messages[2]).toEqual({ t: 'result', request: 7, result: { ok: true, seq: 1 } })
  })

  it('rejects a subsystem that the hello did not name', async () => {
    const hub = makeHub()
    hub.attach(keyboard)
    const link = await joined(hub, page, controls)
    link.send({ t: 'submit', request: 2, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(link.messages[1]).toEqual({
      t: 'result',
      request: 2,
      result: { ok: false, reason: 'not-permitted', problems: [] },
    })
    expect(hub.record()).toHaveLength(0)
  })

  it('rejects an input of an output subsystem', async () => {
    const link = await joined(makeHub(), page)
    link.send({ t: 'submit', request: 3, subsystem: 'page', input: setField('a') })
    await settle()
    expect(link.messages[1]).toMatchObject({ t: 'result', request: 3, result: { ok: false, reason: 'not-permitted' } })
  })

  it('sends the rejection of the hub for an input type that is not known', async () => {
    const link = await joined(makeHub(), keyboard)
    link.send({ t: 'submit', request: 4, subsystem: 'keyboard', input: { type: 'sound/play' } })
    await settle()
    expect(link.messages[1]).toMatchObject({ result: { ok: false, reason: 'unknown-type' } })
    expect(link.messages).toHaveLength(2)
  })

  it('sends the text of an error and keeps the link open', async () => {
    const hub = makeHub([store, boom])
    const link = await joined(hub, keyboard)
    link.send({ t: 'submit', request: 5, subsystem: 'keyboard', input: { type: 'boom/go' } })
    await settle()
    expect(link.messages[1]).toEqual({ t: 'result', request: 5, error: 'It broke.' })
    expect('result' in (link.messages[1] ?? {})).toBe(false)
    expect(link.isClosed()).toBe(false)
    link.send({ t: 'submit', request: 6, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(link.messages[3]).toEqual({ t: 'result', request: 6, result: { ok: true, seq: 1 } })
  })

  it('keeps the order when a listener of the hub submits a second input', async () => {
    const hub = makeHub()
    const link = await joined(hub, page, keyboard)
    const other = hub.attach(controls)
    let again = true
    other.subscribe((event) => {
      if (event.type === 'applied' && again) {
        again = false
        void other.submit({ type: 'time/tick' })
      }
    })
    link.send({ t: 'submit', request: 1, subsystem: 'keyboard', input: setField('a') })
    await settle()
    expect(link.messages.map((m) => [m.t, (m.input as { seq?: number } | undefined)?.seq ?? m.request])).toEqual([
      ['welcome', undefined],
      ['applied', 1],
      ['applied', 2],
      ['result', 1],
    ])
    expect(link.messages[1]?.parts).toEqual({ store: { fields: { a: '1' } } })
    expect(link.messages[2]?.parts).toEqual({ time: { ticks: 1 } })
  })
})

describe('the end of a connection', () => {
  it('frees the IDs for a new link', async () => {
    const hub = makeHub()
    const first = await joined(hub, page)
    first.close()
    await settle()
    const second = connect(hub)
    second.send(hello(page))
    await settle()
    expect(second.messages[0]).toMatchObject({ t: 'welcome' })
  })

  it('keeps the hub running', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    link.close()
    await settle()
    expect(hub.status).toBe('running')
  })

  it('closes each port one time, also for a second close event', async () => {
    const hub = makeHub()
    const ports: Port[] = []
    const closes: ReturnType<typeof vi.fn>[] = []
    const wrapped: Hub = {
      get status() {
        return hub.status
      },
      start: () => {
        hub.start()
      },
      stop: () => {
        hub.stop()
      },
      read: () => hub.read(),
      record: () => hub.record(),
      attach: (subsystem) => {
        const port = hub.attach(subsystem)
        const close = vi.fn(() => {
          port.close()
        })
        ports.push(port)
        closes.push(close)
        return { ...port, close }
      },
    }
    const [client, server] = createChannelPair()
    serveLink(wrapped, server)
    client.send(JSON.stringify(hello(page, controls)))
    await settle()
    client.close()
    client.close()
    await settle()
    server.close()
    await settle()
    expect(closes).toHaveLength(2)
    for (const close of closes) {
      expect(close).toHaveBeenCalledTimes(1)
    }
  })

  it('closes the ports when serveLink closes the channel itself', async () => {
    const hub = makeHub()
    const link = await joined(hub, page)
    link.send(hello(controls))
    await settle()
    expect(link.isClosed()).toBe(true)
    expect(() => hub.attach(page)).not.toThrow()
  })

  it('sends nothing and ignores a message after the close', async () => {
    const hub = makeHub()
    const input = hub.attach(keyboard)
    const sent: string[] = []
    let deliver: ((text: string) => void) | undefined
    let closeListener: (() => void) | undefined
    const channel: Channel = {
      send: (text) => {
        sent.push(text)
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: (listener) => {
        closeListener = listener
      },
      close: () => undefined,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page)))
    expect(sent).toHaveLength(1)
    closeListener?.()
    deliver?.(JSON.stringify(hello(controls)))
    deliver?.(JSON.stringify({ t: 'submit', request: 1, subsystem: 'page', input: setField('a') }))
    deliver?.('garbage')
    await input.submit({ type: 'time/tick' })
    await settle()
    expect(sent).toHaveLength(1)
    expect(() => hub.attach(page)).not.toThrow()
    expect(() => hub.attach(controls)).not.toThrow()
  })

  it('does not send a result that completes after the close', async () => {
    const hub = makeHub()
    const link = await joined(hub, page, keyboard)
    link.send({ t: 'submit', request: 1, subsystem: 'keyboard', input: setField('a') })
    link.close()
    await settle()
    expect(link.messages.map((m) => m.t)).toEqual(['welcome'])
    expect(hub.record()).toHaveLength(1)
  })

  it('does not send a result that completes after the close, for a channel that accepts a send', async () => {
    const hub = makeHub()
    const sent: string[] = []
    let deliver: ((text: string) => void) | undefined
    let closeListener: (() => void) | undefined
    const channel: Channel = {
      send: (text) => {
        sent.push(text)
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: (listener) => {
        closeListener = listener
      },
      close: () => undefined,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page, keyboard)))
    deliver?.(JSON.stringify({ t: 'submit', request: 1, subsystem: 'keyboard', input: setField('a') }))
    closeListener?.()
    await settle()
    expect(sent.map((text) => (JSON.parse(text) as { t: string }).t)).toEqual(['welcome', 'applied'])
  })

  it('treats a channel whose send throws as closed', async () => {
    const hub = makeHub()
    let deliver: ((text: string) => void) | undefined
    let failing = false
    const channel: Channel = {
      send: () => {
        if (failing) {
          throw new Error('The channel is closed.')
        }
      },
      onMessage: (listener) => {
        deliver = listener
      },
      onClose: () => undefined,
      close: () => undefined,
    }
    serveLink(hub, channel)
    deliver?.(JSON.stringify(hello(page)))
    failing = true
    await expect(hub.attach(keyboard).submit({ type: 'time/tick' })).resolves.toEqual({ ok: true, seq: 1 })
    expect(() => hub.attach(page)).not.toThrow()
  })
})
