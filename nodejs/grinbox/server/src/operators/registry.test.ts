import { describe, expect, it } from 'vitest'
import {
  UnknownOperatorTypeError,
  currentCodeVersion,
  getOperatorType,
  listOperatorTypes,
  resolveSnapshot,
} from './registry.js'

describe('operator registry', () => {
  it('returns the implemented type for a known type_key', () => {
    const type = getOperatorType('rule_based_tagger')
    expect(type).toBeDefined()
    expect(type.type_key).toBe('rule_based_tagger')
    expect(type.code_version).toBe('1')
  })

  it('returns the implemented llm_tagger type (O2)', () => {
    const type = getOperatorType('llm_tagger')
    expect(type).toBeDefined()
    expect(type.type_key).toBe('llm_tagger')
    expect(type.code_version).toBe('1')
  })

  it('returns the implemented notify and apply_category Actions', () => {
    expect(getOperatorType('notify').type_key).toBe('notify')
    expect(getOperatorType('apply_category').type_key).toBe('apply_category')
  })

  it('returns undefined for a declared-but-unimplemented type_key', () => {
    // digest_delivery is declared in @twin-digital/grinbox-shared but has no run yet.
    expect(getOperatorType('digest_delivery')).toBeUndefined()
  })

  it('returns undefined for an unknown type_key', () => {
    expect(getOperatorType('nope')).toBeUndefined()
  })

  it('lists only implemented types', () => {
    const keys = listOperatorTypes().map((t) => t.type_key)
    expect(keys).toEqual(['llm_tagger', 'rule_based_tagger', 'notify', 'apply_category'])
  })

  it('exposes the current code_version per implemented type', () => {
    expect(currentCodeVersion('rule_based_tagger')).toBe('1')
  })

  describe('resolveSnapshot', () => {
    it('resolves a known type at the current code version', () => {
      const type = resolveSnapshot({
        type_key: 'rule_based_tagger',
        type_code_version: '1',
      })
      expect(type.type_key).toBe('rule_based_tagger')
    })

    it('throws for an unimplemented type', () => {
      expect(() =>
        resolveSnapshot({
          type_key: 'digest_delivery',
          type_code_version: '1',
        }),
      ).toThrow(UnknownOperatorTypeError)
    })

    it('throws for a known type at an unknown code version', () => {
      expect(() =>
        resolveSnapshot({
          type_key: 'rule_based_tagger',
          type_code_version: '99',
        }),
      ).toThrow(UnknownOperatorTypeError)
    })
  })
})
