import { describe, expect, it, vi } from 'vitest'
import { createHub } from './hub.js'
import type { HubEvent, ModelSubsystem } from './types.js'

const store: ModelSubsystem<{ fields: Record<string, string> }> = {
  id: 'store',
  inputs: ['store/set-field'],
  initial: { fields: {} },
  apply: (part, input) => {
    const { name, value } = input.payload as { name: string; value: string }
    return { fields: { ...part.fields, [name]: value } }
  },
}

const setField = (name: string, value = '1') => ({ type: 'store/set-field', payload: { name, value } })

const make = (options: { onError?: (error: unknown) => void } = {}) => {
  const hub = createHub({ subsystems: [store], ...options })
  const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
  const renderer = hub.attach({ id: 'renderer', kind: 'output' })
  return { hub, keyboard, renderer }
}

describe('events', () => {
  it('sends one applied event with the recorded input', async () => {
    const { hub, keyboard, renderer } = make()
    const events: HubEvent[] = []
    renderer.subscribe((event) => events.push(event))
    hub.start()
    await keyboard.submit(setField('a'))
    expect(events).toEqual([
      { type: 'started' },
      {
        type: 'applied',
        input: { seq: 1, source: 'keyboard', type: 'store/set-field', payload: { name: 'a', value: '1' } },
      },
    ])
  })

  it('gives the joined state after the input to a read in a listener', async () => {
    const { hub, keyboard, renderer } = make()
    const seen: unknown[] = []
    renderer.subscribe((event) => {
      if (event.type === 'applied') {
        seen.push(renderer.read().store)
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    expect(seen).toEqual([{ fields: { a: '1' } }])
  })

  it('sends no event for a rejected input', async () => {
    const { hub, keyboard, renderer } = make()
    const listener = vi.fn()
    hub.start()
    renderer.subscribe(listener)
    await keyboard.submit({ type: 'sound/play' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not send the current event to a listener that registers during the event', async () => {
    const { hub, keyboard, renderer } = make()
    const late = vi.fn()
    let added = false
    renderer.subscribe((event) => {
      if (event.type === 'applied' && !added) {
        added = true
        renderer.subscribe(late)
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    expect(late).not.toHaveBeenCalled()
  })

  it('does not send the current event to a port that attaches during the event', async () => {
    const { hub, keyboard, renderer } = make()
    const late = vi.fn()
    let added = false
    renderer.subscribe((event) => {
      if (event.type === 'applied' && !added) {
        added = true
        hub.attach({ id: 'late', kind: 'output' }).subscribe(late)
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    expect(late).not.toHaveBeenCalled()
  })

  it('sends no event to a removed listener', async () => {
    const { hub, keyboard, renderer } = make()
    const listener = vi.fn()
    const remove = renderer.subscribe(listener)
    remove()
    hub.start()
    await keyboard.submit(setField('a'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats a function that is registered two times as two registrations', async () => {
    const { hub, keyboard, renderer } = make()
    const listener = vi.fn()
    const removeFirst = renderer.subscribe(listener)
    renderer.subscribe(listener)
    hub.start()
    expect(listener).toHaveBeenCalledTimes(2)
    removeFirst()
    await keyboard.submit(setField('a'))
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('calls the ports in the order of attachment and the listeners in the order of registration', async () => {
    const hub = createHub({ subsystems: [store] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    const first = hub.attach({ id: 'first', kind: 'output' })
    const second = hub.attach({ id: 'second', kind: 'output' })
    const calls: string[] = []
    second.subscribe(() => calls.push('second-1'))
    first.subscribe(() => calls.push('first-1'))
    first.subscribe(() => calls.push('first-2'))
    hub.start()
    calls.length = 0
    await keyboard.submit(setField('a'))
    expect(calls).toEqual(['first-1', 'first-2', 'second-1'])
  })

  it('sends no event to a closed port and frees its ID', async () => {
    const { hub, keyboard, renderer } = make()
    const listener = vi.fn()
    renderer.subscribe(listener)
    renderer.close()
    hub.start()
    await keyboard.submit(setField('a'))
    expect(listener).not.toHaveBeenCalled()
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).not.toThrow()
  })

  it('rejects an input from a closed port and still reads', async () => {
    const { hub, keyboard } = make()
    hub.start()
    keyboard.close()
    await expect(keyboard.submit(setField('a'))).resolves.toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(keyboard.read()).toBe(hub.read())
  })

  it('does not call a port that a listener closes during the delivery', async () => {
    const hub = createHub({ subsystems: [store] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    const first = hub.attach({ id: 'first', kind: 'output' })
    const second = hub.attach({ id: 'second', kind: 'output' })
    hub.start()
    const listener = vi.fn()
    first.subscribe(() => {
      second.close()
    })
    second.subscribe(listener)
    await keyboard.submit(setField('a'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not call a listener that a listener removes during the delivery', async () => {
    const { hub, keyboard, renderer } = make()
    hub.start()
    const listener = vi.fn()
    let remove = () => {
      /* set below */
    }
    renderer.subscribe(() => {
      remove()
    })
    remove = renderer.subscribe(listener)
    await keyboard.submit(setField('a'))
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('start and stop', () => {
  it('sends stopping, then rejects with not-running', async () => {
    const { hub, keyboard, renderer } = make()
    const events: string[] = []
    renderer.subscribe((event) => events.push(event.type))
    hub.start()
    hub.stop()
    expect(events).toEqual(['started', 'stopping'])
    await expect(keyboard.submit(setField('a'))).resolves.toMatchObject({ ok: false, reason: 'not-running' })
    expect(events).toEqual(['started', 'stopping'])
  })

  it('reads the last state and the record after the stop', async () => {
    const { hub, keyboard } = make()
    hub.start()
    await keyboard.submit(setField('a'))
    hub.stop()
    expect(hub.read().store).toEqual({ fields: { a: '1' } })
    expect(hub.record()).toHaveLength(1)
  })

  it('sets the status to running before the started event', () => {
    const { hub, renderer } = make()
    let status = ''
    renderer.subscribe(() => {
      status = hub.status
    })
    hub.start()
    expect(status).toBe('running')
  })

  it('rejects an input that a listener sends during stopping', async () => {
    const { hub, keyboard, renderer } = make()
    hub.start()
    let late: Promise<unknown> = Promise.resolve()
    renderer.subscribe((event) => {
      if (event.type === 'stopping') {
        late = keyboard.submit(setField('late'))
      }
    })
    hub.stop()
    await expect(late).resolves.toEqual({ ok: false, reason: 'not-running', problems: [] })
    expect(hub.record()).toEqual([])
  })
})

describe('queue', () => {
  it('applies the inputs in the order of arrival', async () => {
    const { hub, keyboard } = make()
    hub.start()
    const [a, b] = await Promise.all([keyboard.submit(setField('a')), keyboard.submit(setField('b'))])
    expect(a).toEqual({ ok: true, seq: 1 })
    expect(b).toEqual({ ok: true, seq: 2 })
    expect(hub.record().map((r) => (r.payload as { name: string }).name)).toEqual(['a', 'b'])
  })

  it('applies an input inside submit when the hub is idle', () => {
    const { hub, keyboard } = make()
    hub.start()
    void keyboard.submit(setField('a'))
    expect(hub.record()).toHaveLength(1)
  })

  it('applies an input that a listener sends after the other listeners got the event', async () => {
    const { hub, keyboard, renderer } = make()
    const log: string[] = []
    let sent: Promise<unknown> | undefined
    keyboard.subscribe((event) => {
      if (event.type === 'applied' && event.input.seq === 1) {
        sent = keyboard.submit(setField('b'))
        log.push('send')
      }
    })
    renderer.subscribe((event) => {
      if (event.type === 'applied') {
        log.push(`applied-${String(event.input.seq)}`)
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    await sent
    expect(log).toEqual(['send', 'applied-1', 'applied-2'])
  })

  it('resolves the promise of a queued input with its own result', async () => {
    const { hub, keyboard, renderer } = make()
    let sent: Promise<unknown> | undefined
    renderer.subscribe((event) => {
      if (event.type === 'applied' && event.input.seq === 1) {
        sent = keyboard.submit(setField('b'))
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    await expect(sent).resolves.toEqual({ ok: true, seq: 2 })
  })

  it('applies inputs that a listener sends in the order of sending', async () => {
    const { hub, keyboard, renderer } = make()
    let sent = false
    renderer.subscribe((event) => {
      if (event.type === 'applied' && !sent) {
        sent = true
        void keyboard.submit(setField('b'))
        void keyboard.submit(setField('c'))
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    expect(hub.record().map((r) => (r.payload as { name: string }).name)).toEqual(['a', 'b', 'c'])
  })

  it('applies an input that a listener of started sends', async () => {
    const { hub, keyboard, renderer } = make()
    let sent: Promise<unknown> | undefined
    renderer.subscribe((event) => {
      if (event.type === 'started') {
        sent = keyboard.submit(setField('a'))
      }
    })
    hub.start()
    await expect(sent).resolves.toEqual({ ok: true, seq: 1 })
  })

  it('gives not-running to a queued input when the hub stops', async () => {
    const { hub, keyboard, renderer } = make()
    let sent: Promise<unknown> | undefined
    renderer.subscribe((event) => {
      if (event.type === 'applied' && event.input.seq === 1) {
        sent = keyboard.submit(setField('b'))
        hub.stop()
      }
    })
    hub.start()
    await keyboard.submit(setField('a'))
    await expect(sent).resolves.toEqual({ ok: false, reason: 'not-running', problems: [] })
    expect(hub.record()).toHaveLength(1)
  })

  it('rejects the promise of a failing input and goes on with the queue', async () => {
    const failing: ModelSubsystem<null> = {
      id: 'failing',
      inputs: ['failing/go'],
      initial: null,
      apply: () => {
        throw new Error('defect')
      },
    }
    const hub = createHub({ subsystems: [store, failing] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    hub.start()
    const [bad, good] = await Promise.allSettled([
      keyboard.submit({ type: 'failing/go' }),
      keyboard.submit(setField('a')),
    ])
    expect(bad.status).toBe('rejected')
    expect(good).toMatchObject({ status: 'fulfilled', value: { ok: true, seq: 1 } })
  })
})

describe('failure in a listener', () => {
  it('reports the error, calls the next listener, and accepts the input', async () => {
    const onError = vi.fn()
    const { hub, keyboard, renderer } = make({ onError })
    const error = new Error('listener')
    const second = vi.fn()
    renderer.subscribe((event) => {
      if (event.type === 'applied') {
        throw error
      }
    })
    renderer.subscribe(second)
    hub.start()
    await expect(keyboard.submit(setField('a'))).resolves.toEqual({ ok: true, seq: 1 })
    expect(onError).toHaveBeenCalledWith(error)
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ type: 'applied' }))
    expect(hub.record()).toHaveLength(1)
  })

  it('ignores the error of a listener when no onError is given', async () => {
    const { hub, keyboard, renderer } = make()
    renderer.subscribe(() => {
      throw new Error('listener')
    })
    hub.start()
    await expect(keyboard.submit(setField('a'))).resolves.toEqual({ ok: true, seq: 1 })
  })

  describe('when onError throws', () => {
    const onError = () => {
      throw new Error('onError')
    }
    const thrower = () => {
      throw new Error('listener')
    }

    it('still accepts the input and calls the other listeners during applied', async () => {
      const { hub, keyboard, renderer } = make({ onError })
      const other = vi.fn()
      renderer.subscribe((event) => {
        if (event.type === 'applied') {
          thrower()
        }
      })
      renderer.subscribe(other)
      hub.start()
      await expect(keyboard.submit(setField('a'))).resolves.toEqual({ ok: true, seq: 1 })
      expect(other).toHaveBeenCalledWith(expect.objectContaining({ type: 'applied' }))
    })

    it('still sends stopping to the other listeners and stops', () => {
      const { hub, renderer } = make({ onError })
      const other = vi.fn()
      renderer.subscribe((event) => {
        if (event.type === 'stopping') {
          thrower()
        }
      })
      renderer.subscribe(other)
      hub.start()
      hub.stop()
      expect(other).toHaveBeenCalledWith({ type: 'stopping' })
      expect(hub.status).toBe('stopped')
    })

    it('still applies the inputs that a started listener sent', async () => {
      const { hub, keyboard, renderer } = make({ onError })
      let sent: Promise<unknown> | undefined
      renderer.subscribe((event) => {
        if (event.type === 'started') {
          sent = keyboard.submit(setField('a'))
          thrower()
        }
      })
      hub.start()
      await expect(sent).resolves.toEqual({ ok: true, seq: 1 })
    })
  })

  describe('when a listener stops the hub', () => {
    const two = () => {
      const hub = createHub({ subsystems: [store] })
      const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
      const first = hub.attach({ id: 'first', kind: 'output' })
      const second = hub.attach({ id: 'second', kind: 'output' })
      const events: string[] = []
      return { hub, keyboard, first, second, events }
    }

    it('completes the delivery of applied, then sends stopping, in an applied listener', async () => {
      const { hub, keyboard, first, second, events } = two()
      first.subscribe((event) => {
        events.push(`first:${event.type}`)
        if (event.type === 'applied') {
          hub.stop()
          events.push(`status:${hub.status}`)
        }
      })
      second.subscribe((event) => events.push(`second:${event.type}`))
      hub.start()
      events.length = 0
      await keyboard.submit(setField('a'))
      expect(events).toEqual(['first:applied', 'status:running', 'second:applied', 'first:stopping', 'second:stopping'])
      expect(hub.status).toBe('stopped')
    })

    it('completes the delivery of started, then sends stopping, in a started listener', () => {
      const { hub, first, second, events } = two()
      first.subscribe((event) => {
        events.push(`first:${event.type}`)
        if (event.type === 'started') {
          hub.stop()
        }
      })
      second.subscribe((event) => events.push(`second:${event.type}`))
      hub.start()
      expect(events).toEqual(['first:started', 'second:started', 'first:stopping', 'second:stopping'])
      expect(hub.status).toBe('stopped')
    })

    it('throws on a second stop while a stop is requested', () => {
      const { hub, first } = two()
      let error: unknown
      first.subscribe((event) => {
        if (event.type === 'started') {
          hub.stop()
          try {
            hub.stop()
          } catch (caught) {
            error = caught
          }
        }
      })
      hub.start()
      expect(error).toBeInstanceOf(Error)
      expect(hub.status).toBe('stopped')
    })

    it('gives not-running to each input that waits in the queue', async () => {
      const { hub, keyboard, first } = two()
      let sent: Promise<unknown> | undefined
      first.subscribe((event) => {
        if (event.type === 'applied' && event.input.seq === 1) {
          sent = keyboard.submit(setField('b'))
          hub.stop()
        }
      })
      hub.start()
      await keyboard.submit(setField('a'))
      await expect(sent).resolves.toEqual({ ok: false, reason: 'not-running', problems: [] })
      expect(hub.record()).toHaveLength(1)
    })
  })
})

describe('determinism', () => {
  it('gives equal joined states and records with and without an output subsystem', async () => {
    const inputs = [setField('a'), setField('b', '2'), { type: 'sound/play' }, setField('a', '3')]
    const plain = createHub({ subsystems: [store] })
    const watched = createHub({ subsystems: [store] })
    const plainKeys = plain.attach({ id: 'keyboard', kind: 'input' })
    const watchedKeys = watched.attach({ id: 'keyboard', kind: 'input' })
    const renderer = watched.attach({ id: 'renderer', kind: 'output' })
    renderer.subscribe(() => renderer.read())
    plain.start()
    watched.start()
    for (const input of inputs) {
      await plainKeys.submit(input)
      await watchedKeys.submit(input)
    }
    expect(watched.read()).toEqual(plain.read())
    expect(watched.record()).toEqual(plain.record())
    expect(plain.record()).toHaveLength(3)
  })
})
