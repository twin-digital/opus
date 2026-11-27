import { describe, expect, it } from 'vitest'
import { parseSidecar, PIXI_KIND } from './sidecar.js'

describe('parseSidecar', () => {
  it('gives a sidecar for a correct object', () => {
    expect(parseSidecar({ kind: 'pixi', componentType: 'ct_1' })).toEqual({ kind: 'pixi', componentType: 'ct_1' })
  })

  it('permits an extra entry', () => {
    expect(parseSidecar({ kind: 'pixi', componentType: 'ct_1', note: 3 })).toEqual({
      kind: 'pixi',
      componentType: 'ct_1',
    })
  })

  it.each([
    ['null', null],
    ['text', 'pixi'],
    ['an array', [{ kind: 'pixi', componentType: 'ct_1' }]],
    ['an object with no kind', { componentType: 'ct_1' }],
    ['an object with no componentType', { kind: 'pixi' }],
    ['a kind that is not text', { kind: 1, componentType: 'ct_1' }],
    ['a componentType that is not text', { kind: 'pixi', componentType: 1 }],
  ])('gives no value for %s', (_name, value) => {
    expect(parseSidecar(value)).toBeUndefined()
  })

  it('names the kind pixi', () => {
    expect(PIXI_KIND).toBe('pixi')
  })
})
