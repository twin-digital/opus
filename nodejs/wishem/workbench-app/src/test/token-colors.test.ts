import { afterEach, describe, expect, it } from 'vitest'
import { brightness, color, contrast, declarations, mix } from './token-colors.js'

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

  it('writes each channel with two hex digits', () => {
    expect(brightness('#010203', 1)).toBe('#010203')
    expect(mix('#000000', '#000000', 50)).toBe('#000000')
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

  describe('with a declared value', () => {
    const declare = (name: string, value: string) => {
      declarations.set(name, value)
      return name
    }
    afterEach(() => {
      for (const name of [...declarations.keys()].filter((key) => key.startsWith('t-'))) {
        declarations.delete(name)
      }
    })

    it('lowercases a hex value', () => {
      expect(color(declare('t-upper', '#ABCDEF'), 'light')).toBe('#abcdef')
    })

    it('splits light-dark() at the top-level comma of a nested value', () => {
      const name = declare('t-nested', 'light-dark(light-dark(#111111, #222222), #333333)')
      expect(color(name, 'light')).toBe('#111111')
      expect(color(name, 'dark')).toBe('#333333')
    })

    it('reads light-dark() over many lines', () => {
      const name = declare('t-lines', 'light-dark(\n  #111111,\n  #222222\n)')
      expect(color(name, 'dark')).toBe('#222222')
    })

    it('follows a var() reference in each theme', () => {
      declare('t-base', 'light-dark(#111111, #222222)')
      expect(color(declare('t-ref', 'var(--t-base)'), 'dark')).toBe('#222222')
    })

    it('throws for light-dark() with no comma', () => {
      expect(() => color(declare('t-nocomma', 'light-dark(#111111)'), 'light')).toThrow(/comma/)
    })

    it('throws for a value that it cannot resolve', () => {
      expect(() => color(declare('t-bad', 'red'), 'light')).toThrow(/cannot resolve/)
    })

    it('throws for a var() reference to a token that is not declared', () => {
      expect(() => color(declare('t-dangling', 'var(--t-missing)'), 'light')).toThrow(/t-missing/)
    })
  })

  it('throws for a token that is not declared', () => {
    expect(() => color('t-absent', 'light')).toThrow(/t-absent/)
  })

  it('gives 21 for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
})
