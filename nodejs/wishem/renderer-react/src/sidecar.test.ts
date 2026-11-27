import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSidecar, REACT_KIND } from './sidecar.js'

describe('parseSidecar', () => {
  it('gives a sidecar for a correct object', () => {
    expect(parseSidecar({ kind: 'react', componentType: 'ct_1' })).toEqual({ kind: 'react', componentType: 'ct_1' })
  })

  it('permits an extra entry', () => {
    expect(parseSidecar({ kind: 'react', componentType: 'ct_1', note: 3 })).toEqual({
      kind: 'react',
      componentType: 'ct_1',
    })
  })

  it.each([
    ['null', null],
    ['text', 'react'],
    ['an array', [{ kind: 'react', componentType: 'ct_1' }]],
    ['an object with no kind', { componentType: 'ct_1' }],
    ['an object with no componentType', { kind: 'react' }],
    ['a kind that is not text', { kind: 1, componentType: 'ct_1' }],
    ['a componentType that is not text', { kind: 'react', componentType: 1 }],
  ])('gives no value for %s', (_name, value) => {
    expect(parseSidecar(value)).toBeUndefined()
  })

  it('names the kind react', () => {
    expect(REACT_KIND).toBe('react')
  })

  it('has no relative import', () => {
    const source = readFileSync(join(import.meta.dirname, 'sidecar.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.{1,2}\//)
  })
})
