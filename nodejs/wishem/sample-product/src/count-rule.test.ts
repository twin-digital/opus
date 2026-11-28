import { createStore, storeInputs, type Entity, type FieldValue, type Model } from '@thrashplay/wishem-core'
import { startClock, createTime, timeInputs, TIME_ID, type TimePart } from '@thrashplay/wishem-clock'
import { createHub, hubInputs, type Hub, type ModelSubsystem, type RecordedInput } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import color from '../model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json' with { type: 'json' }
import counter from '../model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json' with { type: 'json' }
import state from '../model/state.json' with { type: 'json' }
import { withCountRule } from './count-rule.js'
import { COLOR_FIELD, COLOR_TYPE, COUNTER_TYPE, COUNT_FIELD, SAMPLE_ENTITY } from './ids.js'

const ID_A = 'e_11111111-1111-4111-8111-111111111111'
const ID_B = 'e_22222222-2222-4222-8222-222222222222'
const ID_C = 'e_33333333-3333-4333-8333-333333333333'

const entity = (id: string, count: FieldValue | undefined): Entity => ({
  id,
  components: {
    [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' },
    ...(count === undefined ? {} : { [COUNTER_TYPE]: { [COUNT_FIELD]: count } }),
  },
})

const stringCounter = { ...counter, fields: [{ ...counter.fields[0], type: 'string' }] }

const modelOf = (...entities: Entity[]): Model => ({ definitions: [color, counter] as Model['definitions'], entities })

const sampleModel = (): Model => ({ ...modelOf(), entities: state.entities })

const subsystems = (model: Model, storeId?: string): ModelSubsystem[] => [
  createTime(),
  withCountRule(createStore({ id: storeId, model })),
]

const startHub = (model: Model = sampleModel()): Hub => {
  const hub = createHub({ subsystems: subsystems(model) })
  hub.start()
  return hub
}

const counts = (hub: Hub, key = 'store'): (FieldValue | undefined)[] =>
  (hub.read()[key] as Model).entities.map(
    (e) => (e.components[COUNTER_TYPE] as Entity['components'][string] | undefined)?.[COUNT_FIELD],
  )

const tick = async (hub: Hub, times: number): Promise<void> => {
  const controls = hub.attach({ id: 'ticker', kind: 'input' })
  for (let i = 0; i < times; i++) {
    await controls.submit(timeInputs.advance(100))
  }
  controls.close()
}

describe('withCountRule', () => {
  it('adds 1 to the count at each tick', async () => {
    const hub = startHub()
    await tick(hub, 3)
    expect(counts(hub)).toEqual([3])
  })

  it('continues from a count that a person set', async () => {
    const hub = startHub(modelOf(entity(SAMPLE_ENTITY, 41)))
    await tick(hub, 1)
    expect(counts(hub)).toEqual([42])
  })

  it('adds 1 to each entity with a Counter component', async () => {
    const hub = startHub(modelOf(entity(ID_A, 1), entity(ID_B, undefined), entity(ID_C, 9)))
    await tick(hub, 1)
    expect(counts(hub)).toEqual([2, undefined, 10])
  })

  it.each([
    [-1, 0],
    [0, 1],
    [1.5, 2.5],
  ])('adds 1 to the count %s', async (value, expected) => {
    const hub = startHub(modelOf(entity(SAMPLE_ENTITY, value)))
    await tick(hub, 1)
    expect(counts(hub)).toEqual([expected])
  })

  it('keeps a count that is not a number and accepts the tick', async () => {
    const hub = startHub({
      ...modelOf(entity(ID_A, 'many'), entity(ID_B, '5')),
      definitions: [color, stringCounter] as Model['definitions'],
    })
    await tick(hub, 1)
    expect(counts(hub)).toEqual(['many', '5'])
    expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
  })

  it('keeps a Counter component with no count, and adds 1 to a count', async () => {
    const noCount: Entity = { id: ID_A, components: { [COUNTER_TYPE]: {} } }
    const hub = startHub(modelOf(noCount, entity(ID_B, 5)))
    await tick(hub, 1)
    expect(counts(hub)).toEqual([undefined, 6])
  })

  it('keeps a count of 2 ** 53 and accepts the tick', async () => {
    const hub = startHub(modelOf(entity(SAMPLE_ENTITY, 2 ** 53)))
    await tick(hub, 1)
    expect(counts(hub)).toEqual([2 ** 53])
    expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
  })

  it('returns the same part when no entity has a Counter component', async () => {
    const hub = startHub(modelOf(entity(SAMPLE_ENTITY, undefined)))
    const before = hub.read().store
    await tick(hub, 1)
    expect(hub.read().store).toBe(before)
  })

  it('applies the inputs of the store as the store does', async () => {
    const hub = startHub()
    const controls = hub.attach({ id: 'controls', kind: 'input' })
    const result = await controls.submit(
      storeInputs().setField({
        entity: SAMPLE_ENTITY,
        componentType: COLOR_TYPE,
        field: COLOR_FIELD,
        value: '#15803d',
      }),
    )
    expect(result.ok).toBe(true)
    expect((hub.read().store as Model).entities[0]?.components[COLOR_TYPE]?.[COLOR_FIELD]).toBe('#15803d')
  })

  it('refuses an input of the store that the store refuses', async () => {
    const hub = startHub()
    const controls = hub.attach({ id: 'controls', kind: 'input' })
    const result = await controls.submit(
      storeInputs().setField({ entity: 'e_none', componentType: COLOR_TYPE, field: COLOR_FIELD, value: 'x' }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('has the ID of the store and the input types of the store and the tick', () => {
    const rule = withCountRule(createStore({ id: 'product', model: sampleModel() }))
    expect(rule.id).toBe('product')
    expect(rule.inputs).toEqual(expect.arrayContaining(['product/set-field', 'product/replace-model', 'time/advance']))
  })

  it('counts in a store with a different ID', async () => {
    const hub = createHub({ subsystems: subsystems(sampleModel(), 'product') })
    hub.start()
    await tick(hub, 2)
    expect(counts(hub, 'product')).toEqual([2])
  })

  it('gives equal results for the same tick on the same part', () => {
    const rule = withCountRule(createStore({ model: sampleModel() }))
    const input: RecordedInput = { seq: 1, source: 'clock', type: 'time/advance', payload: { ms: 100 } }
    const context = { read: () => ({}) }
    const first = rule.apply(rule.initial, input, context)
    const second = rule.apply(rule.initial, input, context)
    expect(second).toEqual(first)
    expect(second).not.toEqual(rule.initial)
  })
})

describe('the count follows the record', () => {
  it('gives the same count in a replay of five ticks', async () => {
    const hub = startHub()
    await tick(hub, 5)
    const copy = createHub({
      subsystems: subsystems(sampleModel()),
      record: { start: hub.recordStart(), inputs: hub.record() },
    })
    expect(counts(copy)).toEqual([5])
    expect(counts(copy)).toEqual(counts(hub))
  })

  it('gives 2 after a rewind to the second tick', async () => {
    const hub = startHub()
    await tick(hub, 5)
    const controls = hub.attach({ id: 'rewinder', kind: 'input' })
    const result = await controls.submit(hubInputs.rewind(2))
    expect(result.ok).toBe(true)
    expect(counts(hub)).toEqual([2])
  })

  it('gives 5 after 500 ms of a clock with a step of 100 ms', () => {
    const hub = startHub()
    let callback: (() => void) | undefined
    let time = 0
    const clock = startClock(hub.attach({ id: 'clock', kind: 'input' }), {
      stepMs: 100,
      now: () => time,
      timer: {
        start: (cb) => {
          callback = cb
          return () => undefined
        },
      },
    })
    for (let i = 0; i < 5; i++) {
      time += 100
      callback?.()
    }
    clock.stop()
    expect(counts(hub)).toEqual([5])
  })
})
