import { describe, expect, it } from 'vitest'

import { collectIds, generateIds } from '../src/ids.js'
import { demoProduct, makeRepo } from './helpers.js'

describe('id generation (d-e5ted839)', () => {
  it('generates {prefix}-{8 lowercase base36} ids', () => {
    for (const id of generateIds('r', 20, new Set())) {
      expect(id).toMatch(/^r-[0-9a-z]{8}$/)
    }
    expect(generateIds('q', 1, new Set())[0]).toMatch(/^q-[0-9a-z]{8}$/)
  })

  it('collects every id mentioned under products/ and avoids them', () => {
    const { tree } = makeRepo(demoProduct())
    const taken = collectIds(tree)
    expect(taken).toContain('d-aaaaaaaa')
    expect(taken).toContain('r-cccccccc')
    const generated = generateIds('d', 50, taken)
    for (const id of generated) {
      expect(taken.has(id)).toBe(false)
    }
    expect(new Set(generated).size).toBe(50)
  })
})
