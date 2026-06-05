import { describe, expect, it } from 'vitest'
import { parseCatalogs } from './catalog.js'
import { bumpForPackage, crossesMajor, effectiveRanges, majorOf, MAJOR, PATCH, type Manifest } from './ranges.js'

const catalogs = parseCatalogs(`
catalog:
  react: ^18.2.0
  lodash-es: ^4.17.22
catalogs:
  next:
    react: ^19.0.0
`)

const ranges = (m: Manifest) => effectiveRanges(m, catalogs).ranges

describe('majorOf / crossesMajor', () => {
  it('extracts the leading major and detects crossings', () => {
    expect(majorOf('^19.2.0')).toBe(19)
    expect(crossesMajor('^18.0.0', '^19.0.0')).toBe(true)
    expect(crossesMajor('^18.0.0', '^18.4.0')).toBe(false)
    expect(crossesMajor('^18.0.0', '^18.0.0 || ^19.0.0')).toBe(false) // widening keeps the major
  })
})

describe('effectiveRanges', () => {
  it('resolves catalog: to the catalog range and keeps literals', () => {
    const r = ranges({ name: 'p', dependencies: { react: 'catalog:', express: '^5.0.0' } })
    expect(r['dependencies:react'].range).toBe('^18.2.0')
    expect(r['dependencies:express'].range).toBe('^5.0.0')
  })

  it('collects misconfigurations rather than dropping silently', () => {
    const { misconfigurations } = effectiveRanges({ name: 'p', dependencies: { vue: 'catalog:' } }, catalogs)
    expect(misconfigurations).toHaveLength(1)
  })
})

describe('bumpForPackage', () => {
  const bump = (b: Manifest, h: Manifest) => bumpForPackage(ranges(b), ranges(h))

  it('is null when nothing changed', () => {
    expect(bump({ name: 'p', dependencies: { a: '^1' } }, { name: 'p', dependencies: { a: '^1' } })).toBeNull()
  })

  it('is patch for a regular dependency range change', () => {
    expect(bump({ name: 'p', dependencies: { a: '^1.0.0' } }, { name: 'p', dependencies: { a: '^2.0.0' } })).toBe(PATCH)
  })

  it('is patch for an added or removed dependency (undefined-safe)', () => {
    expect(bump({ name: 'p' }, { name: 'p', dependencies: { a: '^1' } })).toBe(PATCH)
    expect(bump({ name: 'p', dependencies: { a: '^1' } }, { name: 'p' })).toBe(PATCH)
  })

  it('escalates a peerDependency crossing a major to major (literal)', () => {
    expect(
      bump(
        { name: 'p', peerDependencies: { react: '^18.0.0' } },
        { name: 'p', peerDependencies: { react: '^19.0.0' } },
      ),
    ).toBe(MAJOR)
  })

  it('escalates a catalog: peer crossing a major (default → named catalog)', () => {
    // react is ^18.2.0 in the default catalog and ^19.0.0 in the `next` catalog
    expect(
      bump(
        { name: 'p', peerDependencies: { react: 'catalog:' } },
        { name: 'p', peerDependencies: { react: 'catalog:next' } },
      ),
    ).toBe(MAJOR)
  })

  it('stays patch for an in-major peer change', () => {
    expect(
      bump(
        { name: 'p', peerDependencies: { react: '^18.1.0' } },
        { name: 'p', peerDependencies: { react: '^18.4.0' } },
      ),
    ).toBe(PATCH)
  })

  it('ignores devDependencies entirely', () => {
    const b = effectiveRanges({ name: 'p', dependencies: { a: '^1' } } as Manifest, catalogs).ranges
    const h = effectiveRanges({ name: 'p', dependencies: { a: '^1' } } as Manifest, catalogs).ranges
    expect(bumpForPackage(b, h)).toBeNull()
  })
})
