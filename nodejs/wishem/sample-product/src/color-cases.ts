import type { FieldValue } from '@thrashplay/wishem-core'
import { COLORS } from './color-behavior.js'

/** The color that a view of the sample product draws for no value and for a value that is not `#rrggbb`. */
export const FALLBACK_COLOR = '#ff00ff'

/** One value of the field `color` and the color that a view draws for it. */
export interface ColorCase {
  /** Unique in the table. */
  readonly name: string
  /** No key for "no value". */
  readonly value?: FieldValue
  /** `#rrggbb` in lower case. */
  readonly color: string
}

const fallback = (name: string, value: FieldValue): ColorCase => ({ name, value, color: FALLBACK_COLOR })

/** Each case that the tests of the `ClearColor` views check. */
export const COLOR_CASES: readonly ColorCase[] = [
  ...COLORS.map((color): ColorCase => ({ name: `color ${color}`, value: color, color })),
  { name: 'black', value: '#000000', color: '#000000' },
  { name: 'upper case', value: '#1D4ED8', color: '#1d4ed8' },
  { name: 'no value', color: FALLBACK_COLOR },
  fallback('empty text', ''),
  fallback('CSS name red', 'red'),
  fallback('CSS name transparent', 'transparent'),
  fallback('CSS function', 'rgb(29, 78, 216)'),
  fallback('short form', '#fff'),
  fallback('with alpha', '#1d4ed880'),
  fallback('no hash sign', '1d4ed8'),
  fallback('not hexadecimal', '#1d4eg8'),
  fallback('a space before', ' #1d4ed8'),
  fallback('a space after', '#1d4ed8 '),
  fallback('free text', 'blue-ish'),
  fallback('a number', 5),
  fallback('a boolean', true),
]
