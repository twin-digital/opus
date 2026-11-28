import { TIME_ID, createTime, timeInputs, type TimePart } from '@thrashplay/wishem-clock'
import { createStore, storeInputs, type Model } from '@thrashplay/wishem-core'
import { createHub, hubInputs, type ApplyContext, type RecordedInput } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import { withColorRule } from './color-rule.js'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD, CONSTRUCT_MODEL, SCREEN_ENTITY } from './model.js'

const options = { entity: SCREEN_ENTITY, componentType: CLEAR_COLOR_TYPE, field: COLOR_FIELD, colors: COLORS }

const makeRule = () => withColorRule(createStore({ model: CONSTRUCT_MODEL }), options)

const makeHub = (record?: Parameters<typeof createHub>[0]['record']) =>
  createHub({ subsystems: [createTime(), makeRule()], ...(record === undefined ? {} : { record }) })

const colorOf = (part: unknown) => (part as Model).entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]

const tick = async (hub: ReturnType<typeof makeHub>, count: number) => {
  const clock = hub.attach({ id: 'clock', kind: 'input' })
  for (let index = 0; index < count; index += 1) {
    await clock.submit(timeInputs.advance(500))
  }
  return clock
}

describe('withColorRule', () => {
  it('has the ID of the store and declares each store input and time/advance', () => {
    const store = createStore({ model: CONSTRUCT_MODEL })
    const rule = withColorRule(store, options)
    expect(rule.id).toBe(store.id)
    expect(rule.inputs).toEqual(expect.arrayContaining([...store.inputs, 'time/advance']))
  })

  it('gives a store input the same result as the store alone', () => {
    const store = createStore({ model: CONSTRUCT_MODEL })
    const rule = withColorRule(store, options)
    const input = {
      seq: 1,
      source: 'x',
      ...storeInputs().setField({
        entity: SCREEN_ENTITY,
        componentType: CLEAR_COLOR_TYPE,
        field: COLOR_FIELD,
        value: '#000000',
      }),
    } as RecordedInput
    const context: ApplyContext = { read: () => ({}) }
    expect(rule.apply(rule.initial, input, context)).toEqual(store.apply(store.initial, input, context))
  })

  describe('with a hub', () => {
    it('starts at tick 0 with the first color', () => {
      const hub = makeHub()
      hub.start()
      expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(0)
      expect(colorOf(hub.read().store)).toBe(COLORS[0])
    })

    it('sets the second color after one tick, from the new ticks of the part time', async () => {
      const hub = makeHub()
      hub.start()
      await tick(hub, 1)
      expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
      expect(colorOf(hub.read().store)).toBe(COLORS[1])
    })

    it('sets the first color again after four ticks', async () => {
      const hub = makeHub()
      hub.start()
      await tick(hub, 4)
      expect(colorOf(hub.read().store)).toBe(COLORS[0])
    })

    it('returns the same part object when the color is equal to the current value', () => {
      const rule = makeRule()
      const input = { seq: 1, source: 'clock', type: 'time/advance', payload: { ms: 500 } } as RecordedInput
      const context: ApplyContext = { read: () => ({ [TIME_ID]: { now: 0, ticks: 0, running: true } }) }
      expect(rule.apply(rule.initial, input, context)).toBe(rule.initial)
    })

    it('gives an equal part store in a second hub with the option record of the first', async () => {
      const first = makeHub()
      first.start()
      await tick(first, 3)
      const second = makeHub({ start: first.recordStart(), inputs: first.record() })
      expect(second.read().store).toEqual(first.read().store)
    })

    it('gives the second color and ticks 1 after a rewind to 1 after three ticks', async () => {
      const hub = makeHub()
      hub.start()
      const clock = await tick(hub, 3)
      await clock.submit(hubInputs.rewind(1))
      expect(colorOf(hub.read().store)).toBe(COLORS[1])
      expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
    })

    it('refuses the tick with no change when the hub has no part time', async () => {
      const hub = createHub({ subsystems: [makeRule()] })
      hub.start()
      const before = hub.read()
      const result = await hub.attach({ id: 'clock', kind: 'input' }).submit(timeInputs.advance(500))
      expect(result).toMatchObject({ ok: false, reason: 'invalid' })
      expect(hub.read()).toEqual(before)
      expect(hub.seq).toBe(0)
    })
  })
})
