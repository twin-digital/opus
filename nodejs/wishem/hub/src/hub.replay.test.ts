import { describe, expect, it } from 'vitest'
import { HubConfigurationError, InputRefusedError, ReplayError } from './errors.js'
import { createHub } from './hub.js'
import { hubInputs } from './names.js'
import type { Hub, HubEvent, HubRecord, ModelSubsystem, RecordedInput } from './types.js'

interface Counted {
  applied: { seq: number; source: string }[]
  /** A sequence number that the counter refuses. */
  refuseAt?: number
  /** A sequence number at which the counter throws. */
  throwAt?: number
}

const makeCounter = (counted: Counted): ModelSubsystem<{ count: number }> => ({
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    counted.applied.push({ seq: input.seq, source: input.source })
    if (input.seq === counted.refuseAt) {
      throw new InputRefusedError([{ message: 'no', path: ['payload'] }])
    }
    if (input.seq === counted.throwAt) {
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

const other: ModelSubsystem<{ n: number }> = {
  id: 'other',
  inputs: ['other/set'],
  initial: { n: 0 },
  apply: (_part, input) => ({ n: (input.payload as { n: number }).n }),
}

const add = { type: 'counter/add' }

const original = async (inputs: number, options: { checkpointInterval?: number; recordLimit?: number } = {}) => {
  const hub = createHub({ subsystems: [makeCounter({ applied: [] }), label, other], ...options })
  const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
  const pad = hub.attach({ id: 'pad', kind: 'input' })
  hub.start()
  for (let i = 0; i < inputs; i += 1) {
    await (i % 2 === 0 ? keyboard : pad).submit(add)
  }
  return { hub, keyboard, pad }
}

const recordOf = (hub: Hub): HubRecord => ({ start: hub.recordStart(), inputs: hub.record() })

const replayed = (record: HubRecord, counted: Counted = { applied: [] }) =>
  createHub({ subsystems: [makeCounter(counted), label, other], record })

const thrown = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('Nothing was thrown.')
}

describe('a replay', () => {
  it('gives equal joined states and the next sequence number', async () => {
    const { hub, keyboard } = await original(4)
    await keyboard.submit({ type: 'label/set', payload: { text: 'x' } })
    const copy = replayed(recordOf(hub))
    expect(copy.read()).toEqual(hub.read())
    expect(copy.seq).toBe(hub.seq)
    expect(copy.record()).toEqual(hub.record())
    expect(copy.recordStart()).toEqual(hub.recordStart())

    copy.start()
    const port = copy.attach({ id: 'keyboard', kind: 'input' })
    expect(await port.submit(add)).toEqual({ ok: true, seq: hub.seq + 1 })
  })

  it('gives each input to the model subsystems with its source and number', async () => {
    const { hub } = await original(3)
    const counted: Counted = { applied: [] }
    replayed(recordOf(hub), counted)
    expect(counted.applied).toEqual([
      { seq: 1, source: 'keyboard' },
      { seq: 2, source: 'pad' },
      { seq: 3, source: 'keyboard' },
    ])
  })

  it('sends no event and leaves the hub created', async () => {
    const { hub } = await original(3)
    const copy = replayed(recordOf(hub))
    expect(copy.status).toBe('created')
    const events: HubEvent[] = []
    copy.attach({ id: 'screen', kind: 'output' }).subscribe((event) => events.push(event))
    copy.start()
    expect(events).toEqual([{ type: 'started' }])
  })

  it('replays an empty list of inputs', () => {
    const copy = replayed({
      start: { seq: 0, state: { counter: { count: 0 }, label: { text: 'none' }, other: { n: 0 } } },
      inputs: [],
    })
    expect(copy.seq).toBe(0)
    expect(copy.record()).toEqual([])
  })

  it('starts from the start of the record', async () => {
    const { hub } = await original(5)
    const state = hub.read()
    const copy = replayed({ start: { seq: 5, state }, inputs: [] })
    expect(copy.seq).toBe(5)
    expect(copy.read()).toEqual(state)
    expect(copy.recordStart().seq).toBe(5)
  })

  it('replays a record that was limited', async () => {
    const { hub } = await original(250, { checkpointInterval: 100, recordLimit: 200 })
    expect(hub.recordStart().seq).toBe(100)
    const copy = replayed(recordOf(hub))
    expect(copy.read()).toEqual(hub.read())
    expect(copy.seq).toBe(250)
    expect(copy.recordStart().seq).toBe(100)
  })

  it('keeps the checkpoints, so a later rewind works', async () => {
    const { hub } = await original(25, { checkpointInterval: 10 })
    const counted: Counted = { applied: [] }
    const copy = createHub({
      subsystems: [makeCounter(counted), label, other],
      checkpointInterval: 10,
      record: recordOf(hub),
    })
    counted.applied.length = 0
    copy.start()
    const port = copy.attach({ id: 'keyboard', kind: 'input' })
    await port.submit(hubInputs.rewind(17))
    expect(counted.applied.map((a) => a.seq)).toEqual([11, 12, 13, 14, 15, 16, 17])
    expect((copy.read().counter as { count: number }).count).toBe(17)
  })
})

describe('a replay with a rewind in the record', () => {
  it('gives the joined state of the first hub', async () => {
    const { hub, keyboard } = await original(5)
    await keyboard.submit(hubInputs.rewind(2))
    await keyboard.submit(add)
    const copy = replayed(recordOf(hub))
    expect(copy.read()).toEqual(hub.read())
    expect((copy.read().counter as { count: number }).count).toBe(3)
    expect(copy.record().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('a record that does not apply stops the replay', () => {
  it('throws a ReplayError with the number and the problems of a refusal', async () => {
    const { hub } = await original(5)
    const error = thrown(() => replayed(recordOf(hub), { applied: [], refuseAt: 3 }))
    expect(error).toBeInstanceOf(ReplayError)
    expect((error as ReplayError).seq).toBe(3)
    expect((error as ReplayError).problems).toEqual([{ message: 'no', path: ['payload'] }])
  })

  it('throws a ReplayError with the number of an input that makes a subsystem throw', async () => {
    const { hub } = await original(5)
    const error = thrown(() => replayed(recordOf(hub), { applied: [], throwAt: 4 }))
    expect(error).toBeInstanceOf(ReplayError)
    expect((error as ReplayError).seq).toBe(4)
    expect((error as ReplayError).problems.length).toBeGreaterThan(0)
  })

  it('throws a ReplayError for an input type that no subsystem applies', () => {
    const record: HubRecord = {
      start: { seq: 0, state: { counter: { count: 0 }, label: { text: 'none' }, other: { n: 0 } } },
      inputs: [{ seq: 1, source: 'keyboard', type: 'nobody/knows', payload: null }],
    }
    const error = thrown(() => replayed(record))
    expect(error).toBeInstanceOf(ReplayError)
    expect((error as ReplayError).seq).toBe(1)
  })

  it('throws a ReplayError for a rewind that the hub rejects', () => {
    const record: HubRecord = {
      start: { seq: 0, state: { counter: { count: 0 }, label: { text: 'none' }, other: { n: 0 } } },
      inputs: [{ seq: 1, source: 'keyboard', type: 'hub/rewind', payload: { seq: 7 } }],
    }
    const error = thrown(() => replayed(record))
    expect(error).toBeInstanceOf(ReplayError)
    expect((error as ReplayError).seq).toBe(1)
    expect((error as ReplayError).problems[0]?.path).toEqual(['payload', 'seq'])
  })

  it('throws a HubConfigurationError for a gap in the numbers', async () => {
    const { hub } = await original(4)
    const inputs: RecordedInput[] = hub.record().filter((input) => input.seq !== 3)
    const error = thrown(() => replayed({ start: hub.recordStart(), inputs }))
    expect(error).toBeInstanceOf(HubConfigurationError)
    expect((error as Error).message).toContain('4')
  })

  it('throws a HubConfigurationError when the first input does not follow the start', async () => {
    const { hub } = await original(4)
    const error = thrown(() => replayed({ start: hub.recordStart(), inputs: hub.record().slice(1) }))
    expect(error).toBeInstanceOf(HubConfigurationError)
  })

  it('throws a HubConfigurationError for a start with a key that is not a model subsystem', () => {
    const state = { counter: { count: 0 }, label: { text: 'none' }, other: { n: 0 }, extra: 1 }
    const error = thrown(() => replayed({ start: { seq: 0, state }, inputs: [] }))
    expect(error).toBeInstanceOf(HubConfigurationError)
    expect((error as Error).message).toContain('extra')
  })

  it('throws a HubConfigurationError for a start that lacks a model subsystem', () => {
    const state = { counter: { count: 0 }, label: { text: 'none' } }
    const error = thrown(() => replayed({ start: { seq: 0, state }, inputs: [] }))
    expect(error).toBeInstanceOf(HubConfigurationError)
    expect((error as Error).message).toContain('other')
  })
})
