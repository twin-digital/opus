import { describe, expect, it, vi } from 'vitest'
import { HubConfigurationError, InputRefusedError } from './errors.js'
import { createHub } from './hub.js'
import type { ModelSubsystem } from './types.js'

const store: ModelSubsystem<{ fields: Record<string, string> }> = {
  id: 'store',
  inputs: ['store/set-field'],
  initial: { fields: {} },
  apply: (part, input) => {
    const { name, value } = input.payload as { name: string; value: string }
    return { fields: { ...part.fields, [name]: value } }
  },
}

const time: ModelSubsystem<{ now: number; running: boolean }> = {
  id: 'time',
  inputs: ['time/advance', 'time/set-running'],
  initial: { now: 0, running: false },
  apply: (part, input) =>
    input.type === 'time/advance' ?
      { ...part, now: part.now + (input.payload as { by: number }).by }
    : { ...part, running: (input.payload as { running: boolean }).running },
}

const running = (subsystems: ModelSubsystem[] = [store, time]) => {
  const hub = createHub({ subsystems })
  const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
  hub.start()
  return { hub, keyboard }
}

const setField = { type: 'store/set-field', payload: { name: 'a', value: '1' } }

describe('createHub', () => {
  it('joins the first parts of the model subsystems', () => {
    const hub = createHub({ subsystems: [store, time] })
    expect(Object.keys(hub.read())).toEqual(['store', 'time'])
    expect(hub.read().store).toBe(store.initial)
    expect(hub.read().time).toBe(time.initial)
    expect(hub.status).toBe('created')
    expect(hub.record()).toEqual([])
  })

  it('refuses two model subsystems with one ID', () => {
    expect(() => createHub({ subsystems: [store as ModelSubsystem, store as ModelSubsystem] })).toThrow(
      HubConfigurationError,
    )
    expect(() => createHub({ subsystems: [store as ModelSubsystem, store as ModelSubsystem] })).toThrow(/store/)
  })

  it('refuses an input type with an incorrect form', () => {
    const bad = { ...store, inputs: ['SetField'] } as ModelSubsystem
    expect(() => createHub({ subsystems: [bad] })).toThrow(HubConfigurationError)
    expect(() => createHub({ subsystems: [bad] })).toThrow(/SetField/)
  })

  it('refuses an ID with an incorrect form', () => {
    const bad = { ...store, id: 'Store' } as ModelSubsystem
    expect(() => createHub({ subsystems: [bad] })).toThrow(/Store/)
  })

  it('keeps no reference to the list of input types of the caller', async () => {
    const inputs = ['time/set-running']
    const hub = createHub({ subsystems: [{ ...time, inputs }] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    hub.start()
    inputs.push('time/advance')
    expect(await keyboard.submit({ type: 'time/advance', payload: { by: 1 } })).toMatchObject({
      ok: false,
      reason: 'unknown-type',
    })
  })

  it('accepts correct names', () => {
    const subsystem: ModelSubsystem = { ...time, inputs: ['time/set-running'] }
    expect(() => createHub({ subsystems: [subsystem] })).not.toThrow()
  })
})

describe('attach', () => {
  it('gives a port that reads the joined state', () => {
    const hub = createHub({ subsystems: [store] })
    const port = hub.attach({ id: 'renderer', kind: 'output' })
    expect(port.subsystem).toEqual({ id: 'renderer', kind: 'output' })
    expect(port.read()).toBe(hub.read())
  })

  it('refuses an ID that an attached subsystem has', () => {
    const hub = createHub({ subsystems: [store] })
    hub.attach({ id: 'renderer', kind: 'output' })
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).toThrow(HubConfigurationError)
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).toThrow(/renderer/)
  })

  it('refuses an ID that a model subsystem has', () => {
    const hub = createHub({ subsystems: [store] })
    expect(() => hub.attach({ id: 'store', kind: 'input' })).toThrow(/store/)
  })

  it('refuses an ID with an incorrect form', () => {
    const hub = createHub({ subsystems: [store] })
    expect(() => hub.attach({ id: 'Bad Id', kind: 'input' })).toThrow(HubConfigurationError)
  })

  it('frees the ID when the port closes', () => {
    const hub = createHub({ subsystems: [store] })
    const port = hub.attach({ id: 'renderer', kind: 'output' })
    port.close()
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).not.toThrow()
  })

  it('does nothing on a second close of a port', () => {
    const hub = createHub({ subsystems: [store] })
    const first = hub.attach({ id: 'renderer', kind: 'output' })
    first.close()
    const second = hub.attach({ id: 'renderer', kind: 'output' })
    first.close()
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).toThrow(HubConfigurationError)
    second.close()
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).not.toThrow()
  })

  it('keeps no reference to the object of the caller', async () => {
    const hub = createHub({ subsystems: [store] })
    const subsystem: { id: string; kind: 'input' | 'output' } = { id: 'screen', kind: 'output' }
    const port = hub.attach(subsystem)
    hub.start()
    subsystem.kind = 'input'
    expect(await port.submit(setField)).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(Object.isFrozen(port.subsystem)).toBe(true)
  })

  it('refuses an attach on a stopped hub', () => {
    const hub = createHub({ subsystems: [store] })
    hub.start()
    hub.stop()
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).toThrow(Error)
    expect(() => hub.attach({ id: 'renderer', kind: 'output' })).not.toThrow(HubConfigurationError)
  })
})

describe('start and stop', () => {
  it('changes the status', () => {
    const hub = createHub({ subsystems: [store] })
    hub.start()
    expect(hub.status).toBe('running')
    hub.stop()
    expect(hub.status).toBe('stopped')
  })

  it('throws on a start of a hub that is not created', () => {
    const hub = createHub({ subsystems: [store] })
    hub.start()
    expect(() => {
      hub.start()
    }).toThrow(Error)
  })

  it('throws on a stop of a hub that is not running', () => {
    const hub = createHub({ subsystems: [store] })
    expect(() => {
      hub.stop()
    }).toThrow(Error)
  })

  it('rejects an input before the start', async () => {
    const hub = createHub({ subsystems: [store] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    expect(await keyboard.submit(setField)).toEqual({ ok: false, reason: 'not-running', problems: [] })
  })

  it('rejects an input after the stop, and keeps the state and the record', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit(setField)
    hub.stop()
    expect(await keyboard.submit(setField)).toEqual({ ok: false, reason: 'not-running', problems: [] })
    expect(hub.read().store).toEqual({ fields: { a: '1' } })
    expect(hub.record()).toHaveLength(1)
  })
})

describe('submit', () => {
  it('rejects each input of an output subsystem', async () => {
    const { hub } = running()
    const screen = hub.attach({ id: 'screen', kind: 'output' })
    const before = hub.read()
    expect(await screen.submit(setField)).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(hub.read()).toBe(before)
    expect(hub.record()).toEqual([])
  })

  it('rejects a type that no model subsystem declares', async () => {
    const { hub, keyboard } = running()
    const result = await keyboard.submit({ type: 'sound/play' })
    expect(result).toEqual({ ok: false, reason: 'unknown-type', problems: [] })
    expect(hub.record()).toEqual([])
  })

  it('applies two inputs in the order of sending', async () => {
    const { hub, keyboard } = running()
    const first = keyboard.submit({ type: 'store/set-field', payload: { name: 'a', value: 'A' } })
    const second = keyboard.submit({ type: 'store/set-field', payload: { name: 'a', value: 'B' } })
    expect(await first).toEqual({ ok: true, seq: 1 })
    expect(await second).toEqual({ ok: true, seq: 2 })
    expect(hub.read().store).toEqual({ fields: { a: 'B' } })
  })

  it('applies the input before submit returns', () => {
    const { hub, keyboard } = running()
    void keyboard.submit(setField)
    expect(hub.read().store).toEqual({ fields: { a: '1' } })
  })

  it('gives an input only to the model subsystems that declare the type', async () => {
    const { hub, keyboard } = running()
    const before = hub.read()
    await keyboard.submit({ type: 'time/advance', payload: { by: 5 } })
    expect(hub.read().time).toEqual({ now: 5, running: false })
    expect(hub.read().store).toBe(before.store)
  })

  it('gives each input the part that the last input made', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit({ type: 'time/advance', payload: { by: 1 } })
    await keyboard.submit({ type: 'time/advance', payload: { by: 2 } })
    expect(hub.read().time).toEqual({ now: 3, running: false })
  })

  it('gives a model subsystem each recorded input with its sequence number', async () => {
    const seen: number[] = []
    const spy: ModelSubsystem<number> = {
      id: 'spy',
      inputs: ['spy/look'],
      initial: 0,
      apply: (part, input) => {
        seen.push(input.seq)
        return part
      },
    }
    const { keyboard } = running([spy])
    await keyboard.submit({ type: 'spy/look' })
    await keyboard.submit({ type: 'spy/look' })
    expect(seen).toEqual([1, 2])
  })

  it('gives an input to each subsystem that declares the type, in order, with the earlier parts readable', async () => {
    const seen: unknown[] = []
    const physics: ModelSubsystem<{ sawNow: number }> = {
      id: 'physics',
      inputs: ['time/advance'],
      initial: { sawNow: -1 },
      apply: (_part, _input, context) => {
        const joined = context.read() as { time: { now: number } }
        seen.push(joined.time.now)
        return { sawNow: joined.time.now }
      },
    }
    const { hub, keyboard } = running([time, physics])
    await keyboard.submit({ type: 'time/advance', payload: { by: 3 } })
    expect(seen).toEqual([3])
    expect(hub.read().physics).toEqual({ sawNow: 3 })
  })

  it('rejects as invalid when the second subsystem refuses, and changes no part', async () => {
    const refuser: ModelSubsystem<number> = {
      id: 'guard',
      inputs: ['time/advance'],
      initial: 0,
      apply: () => {
        throw new InputRefusedError([{ message: 'too late', path: ['by'] }])
      },
    }
    const { hub, keyboard } = running([time, refuser])
    const before = hub.read()
    const result = await keyboard.submit({ type: 'time/advance', payload: { by: 1 } })
    expect(result).toEqual({ ok: false, reason: 'invalid', problems: [{ message: 'too late', path: ['by'] }] })
    expect(hub.read()).toBe(before)
    expect(hub.read().time).toBe(time.initial)
    expect(hub.record()).toEqual([])
  })

  it('rejects the promise on an error that is not a refusal, and continues', async () => {
    const broken: ModelSubsystem<number> = {
      id: 'broken',
      inputs: ['broken/run'],
      initial: 0,
      apply: (_part, input) => {
        if ((input.payload as { fail: boolean }).fail) {
          throw new Error('defect')
        }
        return 1
      },
    }
    const { hub, keyboard } = running([store, broken])
    const before = hub.read()
    await expect(keyboard.submit({ type: 'broken/run', payload: { fail: true } })).rejects.toThrow('defect')
    expect(hub.read()).toBe(before)
    expect(hub.record()).toEqual([])
    expect(await keyboard.submit({ type: 'broken/run', payload: { fail: false } })).toEqual({ ok: true, seq: 1 })
    expect(hub.read().broken).toBe(1)
  })

  it('gives the sender an Error when a model subsystem throws a value that is not an Error', async () => {
    const bad: ModelSubsystem<number> = {
      id: 'bad',
      inputs: ['bad/run'],
      initial: 0,
      apply: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'broken'
      },
    }
    const { keyboard } = running([bad])
    const error = await keyboard.submit({ type: 'bad/run' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('broken')
  })

  it('gives each model subsystem input A before input B', async () => {
    const calls: string[] = []
    const spy = (id: string): ModelSubsystem<number> => ({
      id,
      inputs: ['spy/look'],
      initial: 0,
      apply: (part, input) => {
        calls.push(`${id}:${(input.payload as { name: string }).name}`)
        return part
      },
    })
    const { keyboard } = running([spy('first'), spy('second')])
    await keyboard.submit({ type: 'spy/look', payload: { name: 'A' } })
    await keyboard.submit({ type: 'spy/look', payload: { name: 'B' } })
    expect(calls).toEqual(['first:A', 'second:A', 'first:B', 'second:B'])
  })

  it('sends no event for an input that a model subsystem refuses', async () => {
    const refuser: ModelSubsystem<number> = {
      id: 'guard',
      inputs: ['guard/go'],
      initial: 0,
      apply: () => {
        throw new InputRefusedError([{ message: 'no' }])
      },
    }
    const { hub, keyboard } = running([refuser])
    const listener = vi.fn()
    hub.attach({ id: 'screen', kind: 'output' }).subscribe(listener)
    expect(await keyboard.submit({ type: 'guard/go' })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('sends no event for an input that makes a model subsystem throw', async () => {
    const broken: ModelSubsystem<number> = {
      id: 'broken',
      inputs: ['broken/run'],
      initial: 0,
      apply: () => {
        throw new Error('defect')
      },
    }
    const { hub, keyboard } = running([broken])
    const listener = vi.fn()
    hub.attach({ id: 'screen', kind: 'output' }).subscribe(listener)
    await expect(keyboard.submit({ type: 'broken/run' })).rejects.toThrow('defect')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('settling of submit', () => {
  // One microtask turn runs a callback that is registered on a settled promise.
  const settle = async () => {
    await Promise.resolve()
  }

  it('gives a result to each of two inputs that are sent one after the other', async () => {
    const { keyboard } = running()
    const first = vi.fn()
    const second = vi.fn()
    void keyboard.submit(setField).then(first)
    await settle()
    expect(first).toHaveBeenCalledWith({ ok: true, seq: 1 })
    void keyboard.submit(setField).then(second)
    await settle()
    expect(second).toHaveBeenCalledWith({ ok: true, seq: 2 })
  })

  it('gives its own accepted result to an input that a listener sends during an applied event', async () => {
    const { hub, keyboard } = running()
    const inner = vi.fn()
    const outer = vi.fn()
    let sent = false
    hub.attach({ id: 'screen', kind: 'output' }).subscribe((event) => {
      if (event.type === 'applied' && !sent) {
        sent = true
        void keyboard.submit(setField).then(inner)
      }
    })
    void keyboard.submit(setField).then(outer)
    await settle()
    expect(outer).toHaveBeenCalledWith({ ok: true, seq: 1 })
    expect(inner).toHaveBeenCalledWith({ ok: true, seq: 2 })
  })

  it('gives not-running to an input that is in the queue when the hub stops', async () => {
    const { hub, keyboard } = running()
    const queued = vi.fn()
    let sent = false
    hub.attach({ id: 'screen', kind: 'output' }).subscribe((event) => {
      if (event.type === 'applied' && !sent) {
        sent = true
        void keyboard.submit(setField).then(queued)
        hub.stop()
      }
    })
    void keyboard.submit(setField)
    await settle()
    expect(queued).toHaveBeenCalledWith({ ok: false, reason: 'not-running', problems: [] })
  })

  it('gives a result to an input that is sent after a model subsystem threw', async () => {
    const broken: ModelSubsystem<number> = {
      id: 'broken',
      inputs: ['broken/run', 'broken/ok'],
      initial: 0,
      apply: (part, input) => {
        if (input.type === 'broken/run') {
          throw new Error('defect')
        }
        return part + 1
      },
    }
    const { keyboard } = running([broken])
    const thrown = vi.fn()
    const after = vi.fn()
    void keyboard.submit({ type: 'broken/run' }).catch(thrown)
    await settle()
    expect(thrown).toHaveBeenCalledTimes(1)
    void keyboard.submit({ type: 'broken/ok' }).then(after)
    await settle()
    expect(after).toHaveBeenCalledWith({ ok: true, seq: 1 })
  })
})

describe('record', () => {
  it('holds each accepted input with its source and a sequence number', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit(setField)
    await keyboard.submit({ type: 'time/advance', payload: { by: 1 } })
    await keyboard.submit({ type: 'sound/play' })
    await keyboard.submit({ type: 'time/advance', payload: { by: 2 } })
    expect(hub.record().map((entry) => [entry.seq, entry.source, entry.type])).toEqual([
      [1, 'keyboard', 'store/set-field'],
      [2, 'keyboard', 'time/advance'],
      [3, 'keyboard', 'time/advance'],
    ])
  })

  it('is not changed by a later change of the object of the sender', async () => {
    const { hub, keyboard } = running()
    const payload = { name: 'a', value: '1' }
    await keyboard.submit({ type: 'store/set-field', payload })
    payload.value = 'changed'
    expect(hub.record().at(0)?.payload).toEqual({ name: 'a', value: '1' })
  })

  it('gives the model subsystems the recorded copy', async () => {
    let received: unknown
    const spy: ModelSubsystem<number> = {
      id: 'spy',
      inputs: ['spy/look'],
      initial: 0,
      apply: (part, input) => {
        received = input
        return part
      },
    }
    const { hub, keyboard } = running([spy])
    const payload = { deep: { n: 1 } }
    await keyboard.submit({ type: 'spy/look', payload })
    expect(received).toBe(hub.record().at(0))
    expect((received as { payload: unknown }).payload).not.toBe(payload)
  })

  it('freezes the recorded input and its payload', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit(setField)
    const entry = hub.record().at(0)
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry?.payload)).toBe(true)
  })

  it('has the payload null for an input with no payload', async () => {
    const ping: ModelSubsystem<number> = { id: 'ping', inputs: ['ping/send'], initial: 0, apply: (part) => part + 1 }
    const { hub, keyboard } = running([ping])
    await keyboard.submit({ type: 'ping/send' })
    expect(hub.record().at(0)?.payload).toBeNull()
  })

  it('rejects a payload that refers to itself', async () => {
    const { hub, keyboard } = running()
    const payload: Record<string, unknown> = {}
    payload.self = payload
    const result = await keyboard.submit({ type: 'store/set-field', payload })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(hub.record()).toEqual([])
  })

  it('rejects a payload that JSON cannot hold', async () => {
    const { keyboard } = running()
    const result = await keyboard.submit({ type: 'store/set-field', payload: { n: 1n } })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('freezes the nested objects of a payload in the record', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit({ type: 'store/set-field', payload: { name: 'a', value: '1', deep: { list: [1] } } })
    const payload = hub.record().at(0)?.payload as { deep: { list: number[] } }
    expect(Object.isFrozen(payload.deep)).toBe(true)
    expect(Object.isFrozen(payload.deep.list)).toBe(true)
  })

  it('gives one problem with the path payload for a payload that refers to itself', async () => {
    const { keyboard } = running()
    const payload: Record<string, unknown> = {}
    payload.self = payload
    const result = await keyboard.submit({ type: 'store/set-field', payload })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    if (!result.ok) {
      expect(result.problems).toHaveLength(1)
      expect(result.problems.at(0)?.path).toEqual(['payload'])
    }
  })

  it('does not change an earlier result of record() after a new input', async () => {
    const { hub, keyboard } = running()
    const before = hub.record()
    await keyboard.submit(setField)
    expect(before).toHaveLength(0)
    expect(hub.record()).toHaveLength(1)
  })

  it('rejects a function payload as invalid with the path payload', async () => {
    const { hub, keyboard } = running()
    const result = await keyboard.submit({ type: 'store/set-field', payload: () => 1 })
    expect(result).toMatchObject({ ok: false, reason: 'invalid', problems: [{ path: ['payload'] }] })
    expect(hub.record()).toEqual([])
  })

  it('has the payload null for an undefined payload', async () => {
    const ping: ModelSubsystem<number> = { id: 'ping', inputs: ['ping/send'], initial: 0, apply: (part) => part + 1 }
    const { hub, keyboard } = running([ping])
    await keyboard.submit({ type: 'ping/send', payload: undefined })
    expect(hub.record().at(0)?.payload).toBeNull()
  })

  it('gives equal states and records for equal inputs, with or without an output subsystem', async () => {
    const a = running()
    const b = running()
    b.hub.attach({ id: 'renderer', kind: 'output' })
    for (const { keyboard } of [a, b]) {
      await keyboard.submit(setField)
      await keyboard.submit({ type: 'time/advance', payload: { by: 2 } })
    }
    expect(a.hub.read()).toEqual(b.hub.read())
    expect(a.hub.record()).toEqual(b.hub.record())
  })
})

describe('joined state', () => {
  it('keeps an earlier read and shares the parts that did not change', async () => {
    const { hub, keyboard } = running()
    const earlier = hub.read()
    await keyboard.submit({ type: 'time/advance', payload: { by: 1 } })
    const later = hub.read()
    expect(earlier.time).toBe(time.initial)
    expect(later.time).toEqual({ now: 1, running: false })
    expect(later.store).toBe(earlier.store)
    expect(hub.read()).toBe(later)
  })

  it('keeps the same part object when a model subsystem returns it', async () => {
    const same: ModelSubsystem<{ n: number }> = {
      id: 'same',
      inputs: ['same/noop'],
      initial: { n: 4 },
      apply: (part) => part,
    }
    const { hub, keyboard } = running([same])
    await keyboard.submit({ type: 'same/noop' })
    expect(hub.read().same).toBe(same.initial)
  })

  it('freezes the joined state before and after an input', async () => {
    const { hub, keyboard } = running()
    expect(Object.isFrozen(hub.read())).toBe(true)
    await keyboard.submit(setField)
    expect(Object.isFrozen(hub.read())).toBe(true)
  })

  it('freezes the joined state that a model subsystem reads', async () => {
    let frozen: boolean | undefined
    const probe: ModelSubsystem<number> = {
      id: 'probe',
      inputs: ['probe/run'],
      initial: 0,
      apply: (part, _input, context) => {
        frozen = Object.isFrozen(context.read())
        return part
      },
    }
    const { keyboard } = running([probe])
    await keyboard.submit({ type: 'probe/run' })
    expect(frozen).toBe(true)
  })
})

describe('subscribe', () => {
  it('calls a listener until the function that it got removes the listener', () => {
    const hub = createHub({ subsystems: [store] })
    const port = hub.attach({ id: 'renderer', kind: 'output' })
    const listener = vi.fn()
    const remove = port.subscribe(listener)
    hub.start()
    expect(listener).toHaveBeenCalledTimes(1)
    remove()
    hub.stop()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
