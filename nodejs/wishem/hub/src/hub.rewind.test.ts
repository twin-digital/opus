import { describe, expect, it } from 'vitest'
import { HubConfigurationError } from './errors.js'
import { createHub } from './hub.js'
import { hubInputs, REWIND_INPUT_TYPE } from './names.js'
import type { Hub, HubEvent, HubOptions, ModelSubsystem } from './types.js'

interface Counted {
  /** The sequence numbers that the counter applied, in order. */
  applied: number[]
  /** A sequence number at which the counter throws. */
  failAt?: number
}

const makeCounter = (counted: Counted): ModelSubsystem<{ count: number }> => ({
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    counted.applied.push(input.seq)
    if (input.seq === counted.failAt) {
      throw new Error('broken')
    }
    return { count: part.count + 1 }
  },
})

const label: ModelSubsystem<{ text: string }> = {
  id: 'label',
  inputs: ['label/set'],
  initial: { text: 'none' },
  apply: (_part, input) => ({ text: (input.payload as { text: string }).text }),
}

const add = { type: 'counter/add' }

const running = (options: Partial<HubOptions> = {}) => {
  const counted: Counted = { applied: [] }
  const hub = createHub({ subsystems: [makeCounter(counted), label], ...options })
  const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
  hub.start()
  return { hub, keyboard, counted }
}

const send = async (keyboard: ReturnType<Hub['attach']>, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await keyboard.submit(add)
  }
}

const count = (hub: Hub) => (hub.read().counter as { count: number }).count

describe('hubInputs.rewind', () => {
  it('makes the input hub/rewind with the target', () => {
    expect(hubInputs.rewind(3)).toEqual({ type: REWIND_INPUT_TYPE, payload: { seq: 3 } })
  })
})

describe('a rewind returns the construct to an earlier point', () => {
  it('after five inputs, rewinds to the input 2', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 5)
    const result = await keyboard.submit(hubInputs.rewind(2))
    expect(result).toEqual({ ok: true, seq: 6 })
    expect(count(hub)).toBe(2)
    expect(hub.record().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(hub.record()[5]).toMatchObject({ type: REWIND_INPUT_TYPE, source: 'keyboard', payload: { seq: 2 } })
    expect(hub.seq).toBe(6)
  })

  it('rewinds to the start', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 3)
    await keyboard.submit(hubInputs.rewind(0))
    expect(hub.read()).toEqual({ counter: { count: 0 }, label: { text: 'none' } })
  })

  it('rewinds to a point after an earlier rewind', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 5)
    await keyboard.submit(hubInputs.rewind(2))
    const result = await keyboard.submit(hubInputs.rewind(5))
    expect(result).toEqual({ ok: true, seq: 7 })
    expect(count(hub)).toBe(5)
  })

  it('rewinds to a rewind', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 5)
    await keyboard.submit(hubInputs.rewind(2))
    await keyboard.submit(hubInputs.rewind(6))
    expect(count(hub)).toBe(2)
  })

  it('accepts a rewind to the last sequence number and changes no part', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 3)
    const before = hub.read()
    const result = await keyboard.submit(hubInputs.rewind(3))
    expect(result).toEqual({ ok: true, seq: 4 })
    expect(hub.read().counter).toBe(before.counter)
    expect(hub.read().label).toBe(before.label)
  })

  it('sends one applied event with the rewind, and a read in the listener gives the new state', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 4)
    const events: HubEvent[] = []
    const reads: number[] = []
    const watcher = hub.attach({ id: 'watcher', kind: 'output' })
    watcher.subscribe((event) => {
      events.push(event)
      reads.push((watcher.read().counter as { count: number }).count)
    })
    await keyboard.submit(hubInputs.rewind(1))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'applied', input: { seq: 5, type: REWIND_INPUT_TYPE } })
    expect(reads).toEqual([1])
  })

  it('applies a rewind that a listener submits after the current event', async () => {
    const { hub, keyboard } = running()
    const watcher = hub.attach({ id: 'watcher', kind: 'input' })
    let sent: Promise<unknown> | undefined
    watcher.subscribe((event) => {
      if (event.type === 'applied' && event.input.type === 'counter/add' && event.input.seq === 3) {
        sent = watcher.submit(hubInputs.rewind(1))
      }
    })
    await send(keyboard, 3)
    await sent
    expect(count(hub)).toBe(1)
    expect(hub.seq).toBe(4)
  })

  it('rejects with not-running when the hub is not running', async () => {
    const counted: Counted = { applied: [] }
    const hub = createHub({ subsystems: [makeCounter(counted)] })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    expect(await keyboard.submit(hubInputs.rewind(0))).toMatchObject({ ok: false, reason: 'not-running' })
    hub.start()
    hub.stop()
    expect(await keyboard.submit(hubInputs.rewind(0))).toMatchObject({ ok: false, reason: 'not-running' })
  })
})

describe('a rewind restores the last checkpoint and applies the inputs after it', () => {
  it('gives the model subsystems the inputs 11 to 17 again and no other input', async () => {
    const { hub, keyboard, counted } = running({ checkpointInterval: 10 })
    await send(keyboard, 25)
    counted.applied.length = 0
    await keyboard.submit(hubInputs.rewind(17))
    expect(counted.applied).toEqual([11, 12, 13, 14, 15, 16, 17])
    expect(count(hub)).toBe(17)
  })

  it('applies again with the same context as the first apply', async () => {
    const seen: unknown[] = []
    const model: ModelSubsystem<{ n: number }> = {
      id: 'second',
      inputs: ['counter/add'],
      initial: { n: 0 },
      apply: (part, input, context) => {
        seen.push({ seq: input.seq, read: context.read() })
        return { n: part.n + 1 }
      },
    }
    const hub = createHub({ subsystems: [makeCounter({ applied: [] }), model], checkpointInterval: 10 })
    const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
    hub.start()
    await send(keyboard, 13)
    const first = seen.find((s) => (s as { seq: number }).seq === 12)
    seen.length = 0
    await keyboard.submit(hubInputs.rewind(12))
    expect(first).toBeDefined()
    expect(seen.find((s) => (s as { seq: number }).seq === 12)).toEqual(first)
  })

  it('keeps a part that no input after the checkpoint changes', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 10 })
    await keyboard.submit({ type: 'label/set', payload: { text: 'a' } })
    await send(keyboard, 12)
    const label10 = hub.read().label
    await keyboard.submit(hubInputs.rewind(12))
    expect(hub.read().label).toBe(label10)
  })

  it('refers to the parts of the checkpoint after a rewind to the input 10', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 10 })
    await send(keyboard, 10)
    const at10 = hub.read()
    await send(keyboard, 5)
    await keyboard.submit(hubInputs.rewind(10))
    expect(hub.read().counter).toBe(at10.counter)
    expect(hub.read().label).toBe(at10.label)
  })

  it('keeps a checkpoint after a rewind, so a later rewind applies from it', async () => {
    const { keyboard, counted } = running({ checkpointInterval: 100 })
    await send(keyboard, 5)
    await keyboard.submit(hubInputs.rewind(2))
    await send(keyboard, 3)
    counted.applied.length = 0
    await keyboard.submit(hubInputs.rewind(8))
    expect(counted.applied).toEqual([7, 8])
  })

  it('moves the start to the checkpoint of a rewind that has a multiple of the interval as its number', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 5, recordLimit: 5 })
    await send(keyboard, 4)
    await keyboard.submit(hubInputs.rewind(1))
    expect(hub.seq).toBe(5)
    expect(count(hub)).toBe(1)
    await send(keyboard, 3)
    expect(count(hub)).toBe(4)
    expect(hub.recordStart().seq).toBe(5)
    expect(hub.recordStart().state.counter).toEqual({ count: 1 })
    expect(hub.record().map((r) => r.seq)).toEqual([6, 7, 8])
  })

  it('applies from the start of the record after the limit moved it', async () => {
    const { hub, keyboard, counted } = running({ checkpointInterval: 5, recordLimit: 10 })
    await send(keyboard, 20)
    expect(hub.recordStart().seq).toBe(10)
    counted.applied.length = 0
    await keyboard.submit(hubInputs.rewind(13))
    expect(counted.applied).toEqual([11, 12, 13])
    expect(count(hub)).toBe(13)
  })
})

describe('the hub rejects a rewind that it cannot do', () => {
  it.each([
    ['a fraction', { seq: 1.5 }],
    ['a string', { seq: '1' }],
    ['not a number', { seq: Number.NaN }],
    ['a negative number', { seq: -1 }],
    ['after the last number', { seq: 4 }],
    ['missing', {}],
  ])('rejects a target that is %s', async (_name, payload) => {
    const { hub, keyboard } = running()
    await send(keyboard, 3)
    const before = hub.read()
    const result = await keyboard.submit({ type: REWIND_INPUT_TYPE, payload })
    expect(result).toMatchObject({ ok: false, reason: 'invalid', problems: [{ path: ['payload', 'seq'] }] })
    expect(hub.read()).toBe(before)
    expect(hub.seq).toBe(3)
    expect(hub.record()).toHaveLength(3)
  })

  it('rejects a rewind with no payload', async () => {
    const { hub, keyboard } = running()
    const result = await keyboard.submit({ type: REWIND_INPUT_TYPE })
    expect(result).toMatchObject({ ok: false, reason: 'invalid', problems: [{ path: ['payload', 'seq'] }] })
    expect(hub.seq).toBe(0)
  })

  it('rejects a target before the start of the record', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 5, recordLimit: 10 })
    await send(keyboard, 20)
    expect(hub.recordStart().seq).toBeGreaterThan(0)
    const before = hub.read()
    const length = hub.record().length
    const result = await keyboard.submit(hubInputs.rewind(hub.recordStart().seq - 1))
    expect(result).toMatchObject({ ok: false, reason: 'invalid', problems: [{ path: ['payload', 'seq'] }] })
    expect(hub.read()).toBe(before)
    expect(hub.record()).toHaveLength(length)
    expect(hub.seq).toBe(20)
  })

  it('accepts a target at the start of the record', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 5, recordLimit: 10 })
    await send(keyboard, 20)
    const start = hub.recordStart()
    const result = await keyboard.submit(hubInputs.rewind(start.seq))
    expect(result.ok).toBe(true)
    expect(hub.read().counter).toBe(start.state.counter)
  })

  it('gives the error of a model subsystem to the sender and changes nothing', async () => {
    const { hub, keyboard, counted } = running({ checkpointInterval: 10 })
    await send(keyboard, 14)
    const before = hub.read()
    const events: HubEvent[] = []
    hub.attach({ id: 'watcher', kind: 'output' }).subscribe((event) => events.push(event))
    counted.failAt = 12
    await expect(keyboard.submit(hubInputs.rewind(13))).rejects.toThrow()
    expect(hub.read()).toBe(before)
    expect(hub.seq).toBe(14)
    expect(hub.record()).toHaveLength(14)
    expect(events).toEqual([])
    counted.failAt = undefined
    expect(await keyboard.submit(add)).toEqual({ ok: true, seq: 15 })
  })

  it('rejects an input type of the hub that is not known with unknown-type', async () => {
    const { keyboard } = running()
    expect(await keyboard.submit({ type: 'hub/undo' })).toMatchObject({ ok: false, reason: 'unknown-type' })
  })
})

describe('a hub can limit the sources of a rewind', () => {
  const limited = (rewindSources: readonly string[] = ['construct-manager']) => {
    const { hub, keyboard } = running({ rewindSources })
    const manager = hub.attach({ id: 'construct-manager', kind: 'input' })
    return { hub, keyboard, manager }
  }

  it('accepts a rewind from a source in the list', async () => {
    const { hub, keyboard, manager } = limited()
    await send(keyboard, 3)
    expect(await manager.submit(hubInputs.rewind(1))).toEqual({ ok: true, seq: 4 })
    expect(count(hub)).toBe(1)
  })

  it('rejects a rewind from a source that is not in the list, and changes nothing', async () => {
    const { hub, keyboard } = limited()
    await send(keyboard, 3)
    const events: HubEvent[] = []
    hub.attach({ id: 'screen', kind: 'output' }).subscribe((event) => events.push(event))
    const state = hub.read()
    const record = hub.record()
    expect(await keyboard.submit(hubInputs.rewind(1))).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(hub.read()).toBe(state)
    expect(hub.record()).toEqual(record)
    expect(hub.seq).toBe(3)
    expect(events).toEqual([])
  })

  it('accepts time/advance from a source that is not in the list', async () => {
    const time: ModelSubsystem<number> = { id: 'time', inputs: ['time/advance'], initial: 0, apply: (part) => part + 1 }
    const hub = createHub({ subsystems: [time], rewindSources: ['construct-manager'] })
    const keys = hub.attach({ id: 'keys', kind: 'input' })
    hub.start()
    expect(await keys.submit({ type: 'time/advance' })).toEqual({ ok: true, seq: 1 })
  })

  it('throws a configuration error that names a source that is not an ID', () => {
    const make = () => createHub({ subsystems: [label], rewindSources: ['Bad Source'] })
    expect(make).toThrow(HubConfigurationError)
    expect(make).toThrow(/Bad Source/)
  })

  it('rejects each rewind for an empty list', async () => {
    const { hub, keyboard, manager } = limited([])
    await send(keyboard, 2)
    expect(await keyboard.submit(hubInputs.rewind(1))).toMatchObject({ ok: false, reason: 'not-permitted' })
    expect(await manager.submit(hubInputs.rewind(1))).toMatchObject({ ok: false, reason: 'not-permitted' })
    expect(hub.seq).toBe(2)
  })
})

describe('the validity of the start of the record', () => {
  it('holds the start back for a rewind to an early target, and then moves it to the checkpoint of the rewind', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 5, recordLimit: 20 })
    await send(keyboard, 10)
    await keyboard.submit(hubInputs.rewind(2))
    await send(keyboard, 14)
    expect(hub.seq).toBe(25)
    expect(hub.recordStart().seq).toBe(11)
    expect(hub.record().length).toBeLessThanOrEqual(20)
    expect(hub.record()[0].seq).toBe(12)
    await send(keyboard, 7)
    expect(hub.seq).toBe(32)
    expect(hub.recordStart().seq).toBe(15)
    expect(hub.record().map((r) => r.seq)).toEqual(Array.from({ length: 17 }, (_unused, i) => 16 + i))
  })

  it('never holds more inputs than the limit, and each rewind in the record has a target at or after the start', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 5, recordLimit: 12 })
    let seq = 0
    for (let i = 0; i < 80; i += 1) {
      const rewind = i % 9 === 8
      const target = Math.max(hub.recordStart().seq, hub.seq - 7)
      const result = await keyboard.submit(rewind ? hubInputs.rewind(target) : add)
      expect(result.ok).toBe(true)
      seq += 1
      expect(hub.seq).toBe(seq)
      expect(hub.record().length).toBeLessThanOrEqual(12)
      const start = hub.recordStart().seq
      for (const input of hub.record()) {
        if (input.type === REWIND_INPUT_TYPE) {
          expect((input.payload as { seq: number }).seq).toBeGreaterThanOrEqual(start)
        }
      }
    }
  })
})
