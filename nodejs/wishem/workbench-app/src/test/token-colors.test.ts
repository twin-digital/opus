import { describe, expect, it } from 'vitest'
import { brightness, color, contrast, mix } from './token-colors.js'

describe('mix', () => {
  it('gives the first color at 100 percent and the second at 0 percent', () => {
    expect(mix('#102030', '#ffffff', 100)).toBe('#102030')
    expect(mix('#102030', '#ffffff', 0)).toBe('#ffffff')
  })

  it('mixes each channel by the weight of the first color', () => {
    expect(mix('#000000', '#ffffff', 50)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 8)).toBe('#ebebeb')
  })
})

describe('brightness', () => {
  it('multiplies each channel', () => {
    expect(brightness('#808080', 0.5)).toBe('#404040')
  })

  it('limits a channel to 255', () => {
    expect(brightness('#f0a080', 1.08)).toBe('#ffad8a')
    expect(brightness('#f0f0f0', 2)).toBe('#ffffff')
  })

  it('does not change a color at factor 1', () => {
    expect(brightness('#f2a93b', 1)).toBe('#f2a93b')
  })
})

describe('color and contrast', () => {
  it('resolves light-dark() per theme', () => {
    expect(color('ground', 'light')).toBe('#f7f7fa')
    expect(color('ground', 'dark')).toBe('#121222')
  })

  it('gives 21 for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
})
