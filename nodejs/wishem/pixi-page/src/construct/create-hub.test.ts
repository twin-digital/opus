import { TIME_ID, timeInputs, type TimePart } from '@thrashplay/wishem-clock'
import type { Model } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import { createPixiHub } from './create-hub.js'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD } from './model.js'

const colorOf = (part: unknown) => (part as Model).entities[0].components[CLEAR_COLOR_TYPE][COLOR_FIELD]

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
    await hub.attach({ id: 'clock', kind: 'input' }).submit(timeInputs.advance(500))
    expect(colorOf(hub.read().store)).toBe(COLORS[1])
  })
})
