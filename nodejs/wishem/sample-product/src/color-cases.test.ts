import { describe, expect, it } from 'vitest'
import { COLORS } from './color-behavior.js'
import { COLOR_CASES, FALLBACK_COLOR } from './color-cases.js'

const COLOR_RULE = /^#[0-9a-fA-F]{6}$/

describe('COLOR_CASES', () => {
  it('has a case for each color of COLORS with the same color', () => {
    for (const color of COLORS) {
      expect(COLOR_CASES.some((item) => item.value === color && item.color === color)).toBe(true)
    }
  })

  it('has the fallback color #ff00ff, which is not in COLORS', () => {
    expect(FALLBACK_COLOR).toBe('#ff00ff')
    expect(COLORS).not.toContain(FALLBACK_COLOR)
  })

  it('has a lower case #rrggbb color in each case', () => {
    for (const item of COLOR_CASES) {
      expect(item.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('has unique names', () => {
    const names = COLOR_CASES.map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('holds the cases of the design', () => {
    const designed: readonly (readonly [unknown, string])[] = [
      ['#000000', '#000000'],
      ['#1D4ED8', '#1d4ed8'],
      ['', FALLBACK_COLOR],
      ['red', FALLBACK_COLOR],
      ['transparent', FALLBACK_COLOR],
      ['rgb(29, 78, 216)', FALLBACK_COLOR],
      ['#fff', FALLBACK_COLOR],
      ['#1d4ed880', FALLBACK_COLOR],
      ['1d4ed8', FALLBACK_COLOR],
      ['#1d4eg8', FALLBACK_COLOR],
      [' #1d4ed8', FALLBACK_COLOR],
      ['#1d4ed8 ', FALLBACK_COLOR],
      ['#1d4ed8\n', FALLBACK_COLOR],
      ['blue-ish', FALLBACK_COLOR],
      [5, FALLBACK_COLOR],
      [true, FALLBACK_COLOR],
    ]
    for (const [value, color] of designed) {
      expect(
        COLOR_CASES.some((item) => item.value === value && item.color === color),
        JSON.stringify(value),
      ).toBe(true)
    }
  })

  it('has a case with no value key and the fallback color', () => {
    expect(COLOR_CASES.some((item) => !('value' in item) && item.color === FALLBACK_COLOR)).toBe(true)
  })

  it('draws the value in lower case for a #rrggbb value and the fallback color for each other case', () => {
    for (const item of COLOR_CASES) {
      const expected =
        typeof item.value === 'string' && COLOR_RULE.test(item.value) ? item.value.toLowerCase() : FALLBACK_COLOR
      expect(item.color, item.name).toBe(expected)
    }
  })
})
