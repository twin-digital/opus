import type { Snapshot } from '@thrashplay/wishem-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect } from './connect.js'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly url: string
  closed = false
  private readonly handlers = new Map<string, ((event: Event) => void)[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener = (type: string, handler: (event: Event) => void) => {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }

  close = () => {
    this.closed = true
  }

  emit = (type: string, data?: string) => {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data })
    this.handlers.get(type)?.forEach((handler) => {
      handler(event)
    })
  }
}

const snapshot = (title: string): Snapshot => ({
  definitions: [],
  entities: [{ id: 'e_1', components: { ct_1: { fld_1: title } } }],
})

const send = (source: FakeEventSource, title: string) => {
  source.emit('snapshot', JSON.stringify(snapshot(title)))
}

const latest = () => {
  const source = FakeEventSource.instances.at(-1)
  if (!source) {
    throw new Error('no EventSource')
  }
  return source
}

describe('connect', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens /snapshots by default and the given url otherwise', async () => {
    const first = connect()
    expect(latest().url).toBe('/snapshots')
    send(latest(), 'a')
    await first
    const second = connect({ url: '/other' })
    expect(latest().url).toBe('/other')
    send(latest(), 'a')
    await second
  })

  it('resolves after the first snapshot event and not before', async () => {
    let resolved = false
    const promise = connect().then((connection) => {
      resolved = true
      return connection
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    send(latest(), 'a')
    const connection = await promise
    expect(resolved).toBe(true)
    expect(connection.getSnapshot()).toEqual(snapshot('a'))
  })

  it('returns the same snapshot object until an event with different text arrives', async () => {
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    const first = connection.getSnapshot()
    expect(connection.getSnapshot()).toBe(first)
    send(latest(), 'a')
    expect(connection.getSnapshot()).toBe(first)
    send(latest(), 'b')
    expect(connection.getSnapshot()).not.toBe(first)
    expect(connection.getSnapshot()).toEqual(snapshot('b'))
  })

  it('calls no listener for an event with the same text', async () => {
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    const listener = vi.fn()
    connection.subscribe(listener)
    send(latest(), 'a')
    expect(listener).not.toHaveBeenCalled()
  })

  it('calls each listener one time with the new snapshot', async () => {
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    const one = vi.fn()
    const two = vi.fn()
    connection.subscribe(one)
    connection.subscribe(two)
    send(latest(), 'b')
    expect(one).toHaveBeenCalledExactlyOnceWith(snapshot('b'))
    expect(two).toHaveBeenCalledExactlyOnceWith(snapshot('b'))
  })

  it('does not call a listener that was removed', async () => {
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    const listener = vi.fn()
    const stop = connection.subscribe(listener)
    stop()
    send(latest(), 'b')
    expect(listener).not.toHaveBeenCalled()
  })

  it('writes one warning for an error event, and no second one until a snapshot arrives', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const promise = connect()
    latest().emit('error')
    latest().emit('error')
    expect(warn).toHaveBeenCalledTimes(1)
    send(latest(), 'a')
    await promise
    latest().emit('error')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('writes an error and keeps the last snapshot for an event that is not valid JSON', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    const first = connection.getSnapshot()
    latest().emit('snapshot', '{not json')
    expect(error).toHaveBeenCalledTimes(1)
    expect(connection.getSnapshot()).toBe(first)
  })

  it('closes the EventSource on close', async () => {
    const promise = connect()
    send(latest(), 'a')
    const connection = await promise
    connection.close()
    expect(latest().closed).toBe(true)
  })
})
