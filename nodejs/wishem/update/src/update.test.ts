import type { Model } from '@thrashplay/wishem-core'
import { createStore, storeInputs } from '@thrashplay/wishem-core'
import { TIME_ID, createTime, timeInputs, type TimePart } from '@thrashplay/wishem-clock'
import { InputRefusedError, createHub, hubInputs, type HubRecord, type ModelSubsystem } from '@thrashplay/wishem-hub'
import { describe, expect, it, vi } from 'vitest'
import { createUpdate, type Fields, type NativeBehavior } from './update.js'

const COUNTER = 'ct_11111111-1111-4111-8111-111111111111'
const OTHER = 'ct_22222222-2222-4222-8222-222222222222'
const COUNT = 'fld_11111111-1111-4111-8111-111111111111'
const TICKS = 'fld_22222222-2222-4222-8222-222222222222'
const NOW = 'fld_33333333-3333-4333-8333-333333333333'
const MS = 'fld_44444444-4444-4444-8444-444444444444'
const E1 = 'e_11111111-1111-4111-8111-111111111111'
const E2 = 'e_22222222-2222-4222-8222-222222222222'
const E3 = 'e_33333333-3333-4333-8333-333333333333'

const model = (count = 0): Model => ({
  definitions: [
    {
      id: COUNTER,
      label: 'Counter',
      fields: [
        { id: COUNT, label: 'count', type: 'number' },
        { id: TICKS, label: 'ticks', type: 'number' },
        { id: NOW, label: 'now', type: 'number' },
        { id: MS, label: 'ms', type: 'number' },
      ],
    },
    { id: OTHER, label: 'Other', fields: [{ id: COUNT, label: 'count', type: 'number' }] },
  ],
  entities: [
    { id: E1, components: { [COUNTER]: { [COUNT]: count, [TICKS]: 0, [NOW]: 0, [MS]: 0 } } },
    { id: E2, components: { [COUNTER]: { [COUNT]: count, [TICKS]: 0, [NOW]: 0, [MS]: 0 } } },
    { id: E3, components: { [OTHER]: { [COUNT]: 100 } } },
  ],
})

const tickInput = { seq: 7, source: 'src', type: 'time/advance', payload: { ms: 50 } }
const timeContext = { read: () => ({ [TIME_ID]: { ticks: 1, now: 50 } }) }

const spyStore = () => {
  const store = createStore({ model: model() })
  const apply = vi.fn(store.apply)
  return { store: { ...store, apply }, apply }
}

const addOne: NativeBehavior = {
  id: 'test/add-one',
  componentType: COUNTER,
  update: (fields) => ({ ...fields, [COUNT]: (fields[COUNT] as number) + 1 }),
}
const double: NativeBehavior = {
  id: 'test/double',
  componentType: COUNTER,
  update: (fields) => ({ ...fields, [COUNT]: (fields[COUNT] as number) * 2 }),
}

const setup = (
  behaviors: NativeBehavior[],
  options: { count?: number; id?: string; time?: boolean; reverse?: boolean } = {},
) => {
  const start = model(options.count)
  const store = createStore({
    model: options.reverse === true ? { ...start, entities: [...start.entities].reverse() } : start,
    ...(options.id === undefined ? {} : { id: options.id }),
  })
  const subsystems: ModelSubsystem[] = [
    ...(options.time === false ? [] : [createTime()]),
    createUpdate({ store, behaviors }),
  ]
  const hub = createHub({ subsystems })
  const input = hub.attach({ id: 'input', kind: 'input' })
  hub.start()
  const part = () => hub.read().store as Model
  const counts = () => part().entities.map((entity) => (entity.components[COUNTER] as Fields | undefined)?.[COUNT])
  return { hub, input, part, counts, subsystems }
}

describe('createUpdate: the store', () => {
  it('has the ID and the first part of the store, and adds time/advance', () => {
    const store = createStore({ model: model() })
    const update = createUpdate({ store, behaviors: [] })
    expect(update.id).toBe('store')
    expect(update.initial).toBe(store.initial)
    expect(update.inputs).toEqual([...store.inputs, 'time/advance'])
  })

  it('wraps a store with the ID product', async () => {
    const { hub, input, subsystems } = setup([addOne], { id: 'product' })
    expect(subsystems[1]?.id).toBe('product')
    expect(subsystems[1]?.inputs).toEqual([
      'product/replace-model',
      'product/add-entity',
      'product/remove-entity',
      'product/set-field',
      'product/clear-field',
      'product/add-reference',
      'product/remove-reference',
      'time/advance',
    ])
    await input.submit(timeInputs.advance(50))
    expect((hub.read().product as Model).entities[0]?.components[COUNTER]?.[COUNT]).toBe(1)
  })

  it('applies an input of the store', async () => {
    const { input, counts } = setup([])
    const result = await input.submit(
      storeInputs().setField({ entity: E1, componentType: COUNTER, field: COUNT, value: 9 }),
    )
    expect(result).toMatchObject({ ok: true })
    expect(counts()).toEqual([9, 0, undefined])
  })

  it('declares store/clear-field and applies it to its store', async () => {
    const { input, counts, subsystems } = setup([])
    expect(subsystems[1]?.inputs).toContain('store/clear-field')
    const result = await input.submit(storeInputs().clearField({ entity: E1, componentType: COUNTER, field: COUNT }))
    expect(result).toMatchObject({ ok: true })
    expect(counts()).toEqual([undefined, 0, undefined])
  })

  it('keeps a count with no value after a tick, for a behavior that keeps a count that is not a number', async () => {
    const keep: NativeBehavior = {
      id: 'test/keep',
      componentType: COUNTER,
      update: (fields) => (typeof fields[COUNT] === 'number' ? { ...fields, [COUNT]: fields[COUNT] + 1 } : fields),
    }
    const { input, counts } = setup([keep])
    await input.submit(storeInputs().clearField({ entity: E1, componentType: COUNTER, field: COUNT }))
    await input.submit(timeInputs.advance(50))
    expect(counts()).toEqual([undefined, 1, undefined])
  })

  it('refuses an input of the store that the store refuses', async () => {
    const { input, part } = setup([])
    const before = part()
    const result = await input.submit(
      storeInputs().setField({ entity: 'e_missing', componentType: COUNTER, field: COUNT, value: 9 }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(part()).toBe(before)
  })
})

describe('createUpdate: behaviors', () => {
  it('runs one behavior for each entity with its component type', async () => {
    const { input, part, counts } = setup([addOne])
    const other = part().entities[2]
    await input.submit(timeInputs.advance(50))
    expect(counts()).toEqual([1, 1, undefined])
    expect(part().entities[2]).toBe(other)
  })

  it('gives the tick: ms, ticks, and now', async () => {
    const write: NativeBehavior = {
      id: 'test/tick',
      componentType: COUNTER,
      update: (fields, tick) => ({ ...fields, [TICKS]: tick.ticks, [NOW]: tick.now, [MS]: tick.ms }),
    }
    const { input, part } = setup([write])
    await input.submit(timeInputs.advance(50))
    await input.submit(timeInputs.advance(50))
    expect(part().entities[0]?.components[COUNTER]).toMatchObject({ [TICKS]: 2, [NOW]: 100, [MS]: 50 })
  })

  it('runs the list in order: double, then add 1', async () => {
    const { input, counts } = setup([double, addOne], { count: 3 })
    await input.submit(timeInputs.advance(50))
    expect(counts().slice(0, 2)).toEqual([7, 7])
  })

  it('runs the list in order: add 1, then double', async () => {
    const { input, counts } = setup([addOne, double], { count: 3 })
    await input.submit(timeInputs.advance(50))
    expect(counts().slice(0, 2)).toEqual([8, 8])
  })

  it('runs a behavior for all entities before the next behavior', async () => {
    const calls: string[] = []
    const spy = (id: string): NativeBehavior => ({
      id,
      componentType: COUNTER,
      update: (fields) => {
        calls.push(id)
        return fields
      },
    })
    const { input } = setup([spy('a'), spy('b')])
    await input.submit(timeInputs.advance(50))
    expect(calls).toEqual(['a', 'a', 'b', 'b'])
  })

  it('keeps a field that the result does not hold', async () => {
    const partial: NativeBehavior = {
      id: 'test/partial',
      componentType: COUNTER,
      update: () => ({ [COUNT]: 5 }),
    }
    const { input, part } = setup([partial], { count: 2 })
    await input.submit(timeInputs.advance(50))
    expect(part().entities[0]?.components[COUNTER]).toEqual({ [COUNT]: 5, [TICKS]: 0, [NOW]: 0, [MS]: 0 })
  })

  it('keeps the part with no behavior', async () => {
    const { hub, input, part } = setup([])
    const before = part()
    await input.submit(timeInputs.advance(50))
    expect(part()).toBe(before)
    expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
  })

  it('keeps the part and writes nothing when a behavior returns its fields', () => {
    const same: NativeBehavior = { id: 'test/same', componentType: COUNTER, update: (fields) => fields }
    const { store, apply } = spyStore()
    const update = createUpdate({ store, behaviors: [same] })
    expect(update.apply(update.initial, tickInput, timeContext)).toBe(update.initial)
    expect(apply).not.toHaveBeenCalled()
  })

  it('writes each changed field with the seq and the source of the tick', () => {
    const { store, apply } = spyStore()
    const update = createUpdate({ store, behaviors: [addOne] })
    update.apply(update.initial, tickInput, timeContext)
    expect(apply).toHaveBeenCalledTimes(2)
    for (const call of apply.mock.calls) {
      expect(call[1]).toMatchObject({ seq: 7, source: 'src', type: 'store/set-field' })
    }
  })

  it('runs a behavior for an entity that follows an entity with no such component', async () => {
    const { input, counts } = setup([addOne], { reverse: true })
    await input.submit(timeInputs.advance(50))
    expect(counts()).toEqual([undefined, 1, 1])
  })

  it('skips a component type that the entity does not own', () => {
    const update = vi.fn((fields: Fields) => fields)
    const inherited: NativeBehavior = { id: 'test/inherited', componentType: 'constructor', update }
    const { store } = spyStore()
    const part = createUpdate({ store, behaviors: [inherited] })
    expect(part.apply(part.initial, tickInput, timeContext)).toBe(part.initial)
    expect(update).not.toHaveBeenCalled()
  })

  it('gives ms 0 when the payload has no number ms', () => {
    const seen: number[] = []
    const spy: NativeBehavior = {
      id: 'test/ms',
      componentType: COUNTER,
      update: (fields, tick) => {
        seen.push(tick.ms)
        return fields
      },
    }
    const { store } = spyStore()
    const update = createUpdate({ store, behaviors: [spy] })
    for (const payload of [{}, undefined, null, { ms: 'x' }]) {
      update.apply(update.initial, { ...tickInput, payload }, timeContext)
    }
    expect(seen).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('createUpdate: faults', () => {
  it('refuses the tick when a behavior throws', async () => {
    const boom: NativeBehavior = {
      id: 'boom',
      componentType: COUNTER,
      update: () => {
        throw new Error('bad')
      },
    }
    const { hub, input, part } = setup([addOne, boom])
    const store = part()
    const time = hub.read()[TIME_ID]
    const result = await input.submit(timeInputs.advance(50))
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    const problems = result.ok ? [] : result.problems
    expect(problems[0]?.message).toBe(`The behavior "boom" for the entity "${E1}": bad`)
    expect(problems[0]?.path).toEqual(['behaviors', 'boom', E1])
    expect(part()).toBe(store)
    expect(hub.read()[TIME_ID]).toBe(time)
  })

  it('refuses the tick when a behavior writes a value of the wrong type', async () => {
    const wrong: NativeBehavior = {
      id: 'wrong',
      componentType: COUNTER,
      update: (fields) => ({ ...fields, [COUNT]: 'x' }),
    }
    const { input, part } = setup([wrong])
    const before = part()
    const result = await input.submit(timeInputs.advance(50))
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    const problems = result.ok ? [] : result.problems
    expect(problems.length).toBeGreaterThan(0)
    for (const problem of problems) {
      expect(problem.message).toContain(`The behavior "wrong" for the entity "${E1}": `)
      expect(problem.path?.slice(0, 3)).toEqual(['behaviors', 'wrong', E1])
    }
    expect(JSON.stringify(problems)).toContain(COUNT)
    expect(part()).toBe(before)
  })

  it('refuses the tick when the behavior returns a key that is not a field', async () => {
    const extra: NativeBehavior = {
      id: 'extra',
      componentType: COUNTER,
      update: (fields) => ({ ...fields, fld_nope: 1 }),
    }
    const { input } = setup([extra])
    expect(await input.submit(timeInputs.advance(50))).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('refuses the tick with each problem of a behavior and keeps its path', () => {
    const many: NativeBehavior = {
      id: 'many',
      componentType: COUNTER,
      update: () => {
        throw new InputRefusedError([{ message: 'one', path: ['x'] }, { message: 'two' }])
      },
    }
    const { store } = spyStore()
    const update = createUpdate({ store, behaviors: [many] })
    let error: unknown
    try {
      update.apply(update.initial, tickInput, timeContext)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(InputRefusedError)
    expect((error as InputRefusedError).problems).toEqual([
      { message: `The behavior "many" for the entity "${E1}": one`, path: ['behaviors', 'many', E1, 'x'] },
      { message: `The behavior "many" for the entity "${E1}": two`, path: ['behaviors', 'many', E1] },
    ])
  })

  it('refuses the tick with the text of a thrown value that is not an error', () => {
    const text: NativeBehavior = {
      id: 'text',
      componentType: COUNTER,
      update: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'oops'
      },
    }
    const { store } = spyStore()
    const update = createUpdate({ store, behaviors: [text] })
    expect(() => update.apply(update.initial, tickInput, timeContext)).toThrow(
      `The behavior "text" for the entity "${E1}": oops`,
    )
  })

  it('refuses the tick when there is no part time', async () => {
    const { input, part } = setup([addOne], { time: false })
    const before = part()
    const result = await input.submit(timeInputs.advance(50))
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    const problems = result.ok ? [] : result.problems
    expect(problems[0]?.path).toEqual(['time'])
    expect(problems[0]?.message).toContain('time')
    expect(part()).toBe(before)
  })

  it('refuses the tick when the part time has no numbers ticks and now', () => {
    const update = createUpdate({ store: createStore({ model: model() }), behaviors: [] })
    const input = { seq: 1, source: 's', type: 'time/advance', payload: { ms: 50 } }
    for (const time of [null, 'x', {}, { ticks: 1 }, { now: 1 }]) {
      expect(() => update.apply(update.initial, input, { read: () => ({ time }) })).toThrow(/time/)
    }
  })

  it('throws the error of checkBehaviors', () => {
    const store = createStore({ model: model() })
    expect(() => createUpdate({ store, behaviors: [addOne, addOne] })).toThrow(/"test\/add-one"/)
  })
})

describe('createUpdate: the record', () => {
  it('gives the same part in a replay', async () => {
    const { hub, input, part } = setup([double, addOne], { count: 1 })
    for (let i = 0; i < 5; i++) {
      await input.submit(timeInputs.advance(50))
    }
    const record: HubRecord = { start: hub.recordStart(), inputs: hub.record() }
    const copy = createHub({ subsystems: setup([double, addOne], { count: 1 }).subsystems, record })
    expect(copy.read().store).toEqual(part())
  })

  it('gives the same part after a rewind', async () => {
    const { input, counts } = setup([addOne])
    for (let i = 0; i < 5; i++) {
      await input.submit(timeInputs.advance(50))
    }
    expect(counts()[0]).toBe(5)
    expect(await input.submit(hubInputs.rewind(2))).toMatchObject({ ok: true })
    expect(counts()[0]).toBe(2)
  })
})
