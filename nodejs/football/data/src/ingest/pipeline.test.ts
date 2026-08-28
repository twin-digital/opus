import { describe, expect, it } from 'vitest'

import { resolveFpProjectionsPath } from './pipeline.js'

describe('resolveFpProjectionsPath', () => {
  it('auto uses the API when a key is set, else the scrape', () => {
    expect(resolveFpProjectionsPath('auto', true)).toBe('api')
    expect(resolveFpProjectionsPath('auto', false)).toBe('scrape')
  })

  it('scrape forces the page scrape even with a key (spares API quota)', () => {
    expect(resolveFpProjectionsPath('scrape', true)).toBe('scrape')
    expect(resolveFpProjectionsPath('scrape', false)).toBe('scrape')
  })

  it('skip keeps stored rows regardless of the key', () => {
    expect(resolveFpProjectionsPath('skip', true)).toBe('skip')
    expect(resolveFpProjectionsPath('skip', false)).toBe('skip')
  })
})
