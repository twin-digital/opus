import { describe, expect, it } from 'vitest'
import { brightness, color, contrast, mix, themes, type Theme } from '../test/token-colors.js'

/**
 * A role, a mix of two colors with a percentage of the first, or a color with a brightness factor.
 */
type ColorSpec = string | { mix: [ColorSpec, ColorSpec, number] } | { brightness: [ColorSpec, number] }

interface StateRow {
  /**
   * The state, as the failure message names it.
   */
  state: string
  foreground: ColorSpec
  background: ColorSpec
}

const resolve = (spec: ColorSpec, theme: Theme): string => {
  if (typeof spec === 'string') {
    return color(spec, theme)
  }
  if ('mix' in spec) {
    const [a, b, percent] = spec.mix
    return mix(resolve(a, theme), resolve(b, theme), percent)
  }
  const [base, factor] = spec.brightness
  return brightness(resolve(base, theme), factor)
}

/**
 * The text that a person reads or uses in each state. A dimmed disabled control is not in the table.
 */
const rows: StateRow[] = [
  { state: 'select trigger with a value, on ground', foreground: 'fg', background: 'ground' },
  { state: 'select trigger placeholder, on ground', foreground: 'fg-muted', background: 'ground' },
  { state: 'select option', foreground: 'fg', background: 'surface' },
  { state: 'select option, highlighted', foreground: 'fg', background: { mix: ['fg', 'surface', 9] } },
]

describe('the contrast of each state', () => {
  it.each(themes.flatMap((theme) => rows.map((row) => ({ theme, ...row }))))(
    '$theme: $state is at least 4.5',
    ({ theme, state, foreground, background }) => {
      const actual = contrast(resolve(foreground, theme), resolve(background, theme))
      expect(actual, `${state} in ${theme} mode is ${actual.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    },
  )
})
