import { describe, expect, it } from 'vitest'

import { EntityComponentTypes, EntityDamageCause } from './index.js'
// Internal helper — not part of the public index.
import { canonicalizeId } from './ids.js'

describe('canonicalizeId', () => {
  // ID1: namespace-optional ids normalize to the prefixed form; namespaced ids pass through.
  it('prefixes bare ids with minecraft:', () => {
    expect(canonicalizeId('health')).toBe('minecraft:health')
  })

  it('passes namespaced ids through unchanged', () => {
    expect(canonicalizeId('minecraft:health')).toBe('minecraft:health')
    expect(canonicalizeId('myns:thing')).toBe('myns:thing')
  })
})

describe('enum mirrors', () => {
  // ID2: declared keys and values, in full.
  it('carries the declared values', () => {
    expect(EntityComponentTypes.Health).toBe('minecraft:health')
    expect(EntityDamageCause.none).toBe('none')
    expect(EntityDamageCause.void).toBe('void')
  })

  it('carries exactly the declared key counts', () => {
    expect(Object.keys(EntityComponentTypes)).toHaveLength(68)
    expect(Object.keys(EntityDamageCause)).toHaveLength(36)
  })
})
