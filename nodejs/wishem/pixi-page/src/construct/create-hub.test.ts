import { TIME_ID, createTime, timeInputs, type TimePart } from '@thrashplay/wishem-clock'
import { createStore, type Model } from '@thrashplay/wishem-core'
import { createHub, hubInputs } from '@thrashplay/wishem-hub'
import { createUpdate } from '@thrashplay/wishem-update'
import { describe, expect, it } from 'vitest'
import { colorBehavior } from './color-behavior.js'
import { createPixiHub } from './create-hub.js'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD, CONSTRUCT_MODEL } from './model.js'

const colorOf = (part: unknown) => (part as Model).entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]

const tick = async (hub: ReturnType<typeof createPixiHub>, count: number) => {
  const clock = hub.attach({ id: 'clock', kind: 'input' })
  for (let index = 0; index < count; index += 1) {
    await clock.submit(timeInputs.advance(500))
  }
  return clock
}

describe('createPixiHub', () => {
  it('orders the model subsystems as time, then store', () => {
    expect(Object.keys(createPixiHub({ running: true }).read())).toEqual([TIME_ID, 'store'])
  })

  it('sets running to false in the part time for running: false', () => {
    expect((createPixiHub({ running: false }).read()[TIME_ID] as TimePart).running).toBe(false)
  })

  it('sets running to true in the part time for running: true', () => {
    expect((createPixiHub({ running: true }).read()[TIME_ID] as TimePart).running).toBe(true)
  })

  it('does not start the hub', () => {
    expect(createPixiHub({ running: true }).status).toBe('created')
  })

  it('sets the second color with one tick after the start', async () => {
    const hub = createPixiHub({ running: true })
    hub.start()
    await tick(hub, 1)
    expect(colorOf(hub.read().store)).toBe(COLORS[1])
  })

  it('gives an equal part store in a second hub with the record of the first', async () => {
    const first = createPixiHub({ running: true })
    first.start()
    await tick(first, 3)
    const second = createHub({
      subsystems: [
        createTime({ running: true }),
        createUpdate({ store: createStore({ model: CONSTRUCT_MODEL }), behaviors: [colorBehavior] }),
      ],
      record: { start: first.recordStart(), inputs: first.record() },
    })
    expect(second.read().store).toEqual(first.read().store)
  })

  it('gives the second color and ticks 1 after a rewind to 1 after three ticks', async () => {
    const hub = createPixiHub({ running: true })
    hub.start()
    const clock = await tick(hub, 3)
    await clock.submit(hubInputs.rewind(1))
    expect(colorOf(hub.read().store)).toBe(COLORS[1])
    expect((hub.read()[TIME_ID] as TimePart).ticks).toBe(1)
  })

  it('records two time/advance inputs and no input of the store for two ticks', async () => {
    const hub = createPixiHub({ running: true })
    hub.start()
    await tick(hub, 2)
    expect(hub.record().map((input) => input.type)).toEqual(['time/advance', 'time/advance'])
  })
})
