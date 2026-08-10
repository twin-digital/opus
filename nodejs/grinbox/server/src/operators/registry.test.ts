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

  it('returns the implemented notify, apply_category, and archive Actions', () => {
    expect(getOperatorType('notify').type_key).toBe('notify')
    expect(getOperatorType('apply_category').type_key).toBe('apply_category')
    expect(getOperatorType('archive').type_key).toBe('archive')
  })

  it('returns the schedule-triggered digest_delivery type', () => {
    expect(getOperatorType('digest_delivery').type_key).toBe('digest_delivery')
  })

  it('returns undefined for an unknown type_key', () => {
    expect(getOperatorType('nope')).toBeUndefined()
  })

  it('lists every registered type', () => {
    // The one intentional literal membership list: registering (or removing) a
    // built-in type must consciously touch this "did you mean to register
    // this?" gate. Other suites derive membership from
    // `operatorTypeKeySchema.options`.
    const keys = listOperatorTypes().map((t) => t.type_key)
    expect(keys).toEqual(['llm_tagger', 'rule_based_tagger', 'notify', 'apply_category', 'archive', 'digest_delivery'])
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

    it('throws for an unknown type', () => {
      expect(() =>
        resolveSnapshot({
          type_key: 'nope',
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
