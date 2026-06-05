import { describe, expect, it } from 'vitest'
import { parseCatalogs, resolveCatalog } from './catalog.js'

const WS = `
packages:
  - nodejs/*/*
catalog:
  react: ^18.2.0
  typescript: ^5.9.3
catalogs:
  react17:
    react: ^17.0.2
  broken:
    self: 'catalog:'
`

describe('parseCatalogs', () => {
  it('reads the default catalog and named catalogs', () => {
    const catalogs = parseCatalogs(WS)
    expect(catalogs.default).toEqual({ react: '^18.2.0', typescript: '^5.9.3' })
    expect(catalogs.react17).toEqual({ react: '^17.0.2' })
  })

  it('throws on the default-defined-twice misconfiguration', () => {
    expect(() => parseCatalogs('catalog:\n  a: ^1\ncatalogs:\n  default:\n    a: ^2\n')).toThrow()
  })

  it('throws on malformed YAML (caller routes to the errored path, not an empty map)', () => {
    expect(() => parseCatalogs('catalog:\n  a: ^1\n :::not yaml')).toThrow()
  })
})

describe('resolveCatalog', () => {
  const catalogs = parseCatalogs(WS)

  it('treats `catalog:` and `catalog:default` as the default catalog', () => {
    expect(resolveCatalog(catalogs, 'react', 'catalog:')).toEqual({ type: 'resolved', specifier: '^18.2.0' })
    expect(resolveCatalog(catalogs, 'react', 'catalog:default')).toEqual({ type: 'resolved', specifier: '^18.2.0' })
  })

  it('resolves named catalogs', () => {
    expect(resolveCatalog(catalogs, 'react', 'catalog:react17')).toEqual({ type: 'resolved', specifier: '^17.0.2' })
  })

  it('returns unused for non-catalog specs', () => {
    expect(resolveCatalog(catalogs, 'react', '^18.0.0')).toEqual({ type: 'unused' })
  })

  it('flags a missing entry as a misconfiguration', () => {
    expect(resolveCatalog(catalogs, 'vue', 'catalog:').type).toBe('misconfiguration')
    expect(resolveCatalog(catalogs, 'react', 'catalog:nope').type).toBe('misconfiguration')
  })

  it('flags a recursive catalog entry as a misconfiguration', () => {
    expect(resolveCatalog(catalogs, 'self', 'catalog:broken').type).toBe('misconfiguration')
  })
})
