import { describe, expect, it } from 'vitest'
import { resolveNamespace } from './namespace.js'

describe('resolveNamespace', () => {
  it('takes a string setting as the namespace', () => {
    expect(resolveNamespace('wizards', '@scope/pack-1')).toBe('wizards')
  })

  it('derives the namespace from the package name for true — the @ dropped and the / a hyphen', () => {
    expect(resolveNamespace(true, '@twin-digital/wizard')).toBe('twin-digital-wizard')
  })

  it('passes an unscoped package name through unchanged for true', () => {
    expect(resolveNamespace(true, 'wizard')).toBe('wizard')
  })

  it('resolves to no namespace when the setting is absent or false', () => {
    expect(resolveNamespace(undefined, '@scope/pack-1')).toBeUndefined()
    expect(resolveNamespace(false, '@scope/pack-1')).toBeUndefined()
  })

  it('fails naming the character when a named namespace holds one outside the set', () => {
    expect(() => resolveNamespace('Wizards', '@scope/pack-1')).toThrow('"W"')
    expect(() => resolveNamespace('my pack', '@scope/pack-1')).toThrow('" "')
    expect(() => resolveNamespace('mob:head', '@scope/pack-1')).toThrow('":"')
  })

  it('accepts every character of the set — lowercase letters, digits, underscore, hyphen, dot', () => {
    expect(resolveNamespace('a-z0.9_ok', '@scope/pack-1')).toBe('a-z0.9_ok')
  })

  it('fails naming the character when the derived namespace holds one outside the set', () => {
    expect(() => resolveNamespace(true, '@scope/Pack')).toThrow('"P"')
  })

  it('fails on an empty namespace', () => {
    expect(() => resolveNamespace('', '@scope/pack-1')).toThrow(/empty/)
  })
})
