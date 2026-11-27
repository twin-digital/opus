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
    expect(hub.record()[0]?.payload).toEqual({ name: 'a', value: '1' })
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
    expect(received).toBe(hub.record()[0])
    expect((received as { payload: unknown }).payload).not.toBe(payload)
  })

  it('freezes the recorded input and its payload', async () => {
    const { hub, keyboard } = running()
    await keyboard.submit(setField)
    const entry = hub.record()[0]
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.payload)).toBe(true)
  })

  it('has the payload null for an input with no payload', async () => {
    const ping: ModelSubsystem<number> = { id: 'ping', inputs: ['ping/send'], initial: 0, apply: (part) => part + 1 }
    const { hub, keyboard } = running([ping])
    await keyboard.submit({ type: 'ping/send' })
    expect(hub.record()[0]?.payload).toBeNull()
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

  it('has the same joined state for a model subsystem that returns the same part', async () => {
    const same: ModelSubsystem<number> = { id: 'same', inputs: ['same/noop'], initial: 4, apply: (part) => part }
    const { hub, keyboard } = running([same])
    const before = hub.read()
    await keyboard.submit({ type: 'same/noop' })
    expect(hub.read().same).toBe(before.same)
  })
})

describe('subscribe', () => {
  it('stores a listener and returns a function that removes it', () => {
    const hub = createHub({ subsystems: [store] })
    const port = hub.attach({ id: 'renderer', kind: 'output' })
    const remove = port.subscribe(vi.fn())
    expect(typeof remove).toBe('function')
    expect(() => {
      remove()
    }).not.toThrow()
  })
})
