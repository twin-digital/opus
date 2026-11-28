import { describe, expect, it } from 'vitest'
import { colorBehavior } from './color-behavior.js'
import { CLEAR_COLOR_TYPE, COLORS, COLOR_FIELD } from './model.js'

const tickOf = (ticks: number) => ({ ms: 500, ticks, now: ticks * 500 })

describe('colorBehavior', () => {
  it('has the ID pixi-page/color and the component type Clear color', () => {
    expect(colorBehavior.id).toBe('pixi-page/color')
    expect(colorBehavior.componentType).toBe(CLEAR_COLOR_TYPE)
  })

  it('sets the second color after tick 1', () => {
    expect(colorBehavior.update({ [COLOR_FIELD]: COLORS[0] }, tickOf(1))).toEqual({ [COLOR_FIELD]: COLORS[1] })
  })

  it('sets the first color again after tick 4', () => {
    expect(colorBehavior.update({ [COLOR_FIELD]: COLORS[3] }, tickOf(4))).toEqual({ [COLOR_FIELD]: COLORS[0] })
  })

  it('returns equal values for the same fields and tick', () => {
    const fields = { [COLOR_FIELD]: COLORS[0] }
    expect(colorBehavior.update(fields, tickOf(2))).toEqual(colorBehavior.update(fields, tickOf(2)))
  })

  it('does not change its input', () => {
    const fields = Object.freeze({ [COLOR_FIELD]: COLORS[0] })
    colorBehavior.update(fields, tickOf(1))
    expect(fields).toEqual({ [COLOR_FIELD]: COLORS[0] })
  })
})
