import { createStore, storeInputs, type Entity, type Model } from '@thrashplay/wishem-core'
import { createTime, timeInputs } from '@thrashplay/wishem-clock'
import { createHub, hubInputs, type Hub } from '@thrashplay/wishem-hub'
import { createUpdate } from '@thrashplay/wishem-update'
import { describe, expect, it } from 'vitest'
import color from '../model/definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json' with { type: 'json' }
import counter from '../model/definitions/ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d.json' with { type: 'json' }
import state from '../model/state.json' with { type: 'json' }
import { COLORS, colorBehavior } from './color-behavior.js'
import { countBehavior } from './count-behavior.js'
import { COLOR_FIELD, COLOR_TYPE, COUNTER_TYPE, COUNT_FIELD, SAMPLE_ENTITY } from './ids.js'
import { behaviors } from './index.js'

const tickOf = (ticks: number) => ({ ms: 100, ticks, now: ticks * 100 })

const startHub = (): Hub => {
  const model = { definitions: [color, counter], entities: state.entities } as Model
  const hub = createHub({ subsystems: [createTime(), createUpdate({ store: createStore({ model }), behaviors })] })
  hub.start()
  return hub
}

const tick = async (hub: Hub, times: number): Promise<void> => {
  const controls = hub.attach({ id: 'ticker', kind: 'input' })
  for (let i = 0; i < times; i++) {
    await controls.submit(timeInputs.advance(100))
  }
  controls.close()
}

const components = (hub: Hub): Entity['components'] =>
  (hub.read().store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)?.components ?? {}
const colorOf = (hub: Hub) => components(hub)[COLOR_TYPE][COLOR_FIELD]
const countOf = (hub: Hub) => components(hub)[COUNTER_TYPE][COUNT_FIELD]

describe('behaviors', () => {
  it('holds the count behavior and then the color behavior', () => {
    expect(behaviors).toEqual([countBehavior, colorBehavior])
  })
})

describe('colorBehavior', () => {
  it('has the ID sample-product/color and the component type Color', () => {
    expect(colorBehavior.id).toBe('sample-product/color')
    expect(colorBehavior.componentType).toBe(COLOR_TYPE)
  })

  it('has four colors that start with the color of the model', () => {
    expect(COLORS).toEqual(['#1d4ed8', '#b91c1c', '#15803d', '#a16207'])
    expect(COLORS[0]).toBe(
      (state.entities[0]?.components as Entity['components'] | undefined)?.[COLOR_TYPE]?.[COLOR_FIELD],
    )
  })

  it('sets the second color after tick 1', () => {
    expect(colorBehavior.update({ [COLOR_FIELD]: COLORS[0] }, tickOf(1))).toEqual({ [COLOR_FIELD]: COLORS[1] })
  })

  it('sets the first color again after tick 4', () => {
    expect(colorBehavior.update({ [COLOR_FIELD]: COLORS[3] }, tickOf(4))).toEqual({ [COLOR_FIELD]: COLORS[0] })
  })

  it('does not change its input', () => {
    const fields = Object.freeze({ [COLOR_FIELD]: COLORS[0] })
    colorBehavior.update(fields, tickOf(1))
    expect(fields).toEqual({ [COLOR_FIELD]: COLORS[0] })
  })
})

describe('the color in a hub', () => {
  it('gives #b91c1c after one tick', async () => {
    const hub = startHub()
    await tick(hub, 1)
    expect(colorOf(hub)).toBe('#b91c1c')
  })

  it('gives #1d4ed8 after four ticks', async () => {
    const hub = startHub()
    await tick(hub, 4)
    expect(colorOf(hub)).toBe('#1d4ed8')
  })

  it('replaces a color that a person set at tick 1 with #15803d at the next tick', async () => {
    const hub = startHub()
    await tick(hub, 1)
    const controls = hub.attach({ id: 'controls', kind: 'input' })
    await controls.submit(
      storeInputs().setField({
        entity: SAMPLE_ENTITY,
        componentType: COLOR_TYPE,
        field: COLOR_FIELD,
        value: '#ffffff',
      }),
    )
    expect(colorOf(hub)).toBe('#ffffff')
    await tick(hub, 1)
    expect(colorOf(hub)).toBe('#15803d')
  })

  it('gives the color and the count of the first tick after a rewind', async () => {
    const hub = startHub()
    await tick(hub, 3)
    const controls = hub.attach({ id: 'rewinder', kind: 'input' })
    const result = await controls.submit(hubInputs.rewind(1))
    expect(result.ok).toBe(true)
    expect(colorOf(hub)).toBe('#b91c1c')
    expect(countOf(hub)).toBe(1)
  })
})
