import { describe, it, expect } from 'vitest'
import { resolveScope } from './scope.js'

describe('resolveScope', () => {
  const root = { isRoot: true }
  const pkg = { isRoot: false }

  it('defaults to `packages` — applies to member packages but not the root', () => {
    expect(resolveScope(undefined, pkg)).toBe(true)
    expect(resolveScope(undefined, root)).toBe(false)
  })

  it('`packages` excludes the root', () => {
    expect(resolveScope('packages', pkg)).toBe(true)
    expect(resolveScope('packages', root)).toBe(false)
  })

  it('`root` applies only to the root', () => {
    expect(resolveScope('root', root)).toBe(true)
    expect(resolveScope('root', pkg)).toBe(false)
  })

  it('`all` applies to everything', () => {
    expect(resolveScope('all', root)).toBe(true)
    expect(resolveScope('all', pkg)).toBe(true)
  })
})
