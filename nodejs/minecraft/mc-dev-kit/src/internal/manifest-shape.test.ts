import { describe, expect, it } from 'vitest'
import { packManifest } from '../../test/fixture.js'
import { checkManifestShape, classifyDependency } from './manifest-shape.js'

const fields = (manifest: unknown): string[] => checkManifestShape(manifest).problems.map((problem) => problem.field)

const faults = (manifest: unknown): string[] => [...checkManifestShape(manifest).faults]

/** A manifest carrying one dependency entry, the thing most rows are about. */
const withDependency = (dependency: unknown): Record<string, unknown> =>
  packManifest('behavior', { dependencies: [dependency] })

describe('checkManifestShape', () => {
  describe('the container pass', () => {
    it.each([
      ['an array', [1, 2, 3]],
      ['a string', 'a manifest'],
      ['null', null],
      ['a number', 7],
    ])('faults a manifest root that is %s', (_label, manifest) => {
      expect(fields(manifest)).toEqual([''])
    })

    it('faults a header that is not an object', () => {
      expect(fields(packManifest('behavior', { header: 'nope' }))).toEqual(['header'])
    })

    it('faults modules and dependencies that are not arrays, and non-object elements', () => {
      expect(fields(packManifest('behavior', { modules: {} }))).toEqual(['modules'])
      expect(fields(packManifest('behavior', { modules: [{ type: 'data' }, 7] }))).toEqual(['modules[1]'])
      expect(fields(packManifest('behavior', { dependencies: 'nope' }))).toEqual(['dependencies'])
      expect(fields(withDependency('nope'))).toEqual(['dependencies[0]'])
    })

    it('does not form-check the fields of a container that faulted', () => {
      expect(fields(packManifest('behavior', { header: 'nope' }))).toEqual(['header'])
      expect(fields(packManifest('behavior', { modules: 'nope' }))).toEqual(['modules'])
    })
  })

  describe('the form pass', () => {
    it.each([
      ['format_version', { format_version: {} }],
      ['header.name', { header: { name: 7 } }],
      ['header.uuid', { header: { uuid: 42 } }],
      ['header.version', { header: { version: {} } }],
      ['modules[0].type', { modules: [{ type: 7 }] }],
      ['modules[0].uuid', { modules: [{ type: 'data', uuid: 7 }] }],
      ['modules[0].version', { modules: [{ type: 'data', version: 7 }] }],
    ])('faults %s', (field, overrides) => {
      const result = checkManifestShape(packManifest('behavior', overrides))

      expect(result.problems).toEqual([{ code: 'manifest-shape-invalid', message: expect.any(String), field }])
      expect([...result.faults]).toEqual([field])
    })

    it.each([
      ['dependencies[0].uuid', { uuid: 42, version: '1.0.0' }],
      ['dependencies[0].module_name', { module_name: 42, version: '1.0.0' }],
      ['dependencies[0].version', { uuid: 'pack-uuid', version: {} }],
    ])('faults %s', (field, dependency) => {
      expect(fields(withDependency(dependency))).toEqual([field])
    })

    it.each([
      ['a number', 2],
      ['a string', '1.2.0'],
    ])('accepts a format_version that is %s', (_label, format_version) => {
      expect(fields(packManifest('behavior', { format_version }))).toEqual([])
    })

    it.each([
      ['a SemVer string', '1.2.3'],
      ['a string that is no SemVer', 'banana'],
      ['a three-number array', [1, 2, 3]],
      ['the placeholder array', [0, 0, 0]],
    ])('accepts a version that is %s', (_label, version) => {
      expect(fields(packManifest('behavior', { header: { uuid: 'u', version } }))).toEqual([])
      expect(fields(withDependency({ uuid: 'u', version }))).toEqual([])
    })

    it.each([
      ['too short', [1, 2]],
      ['too long', [1, 2, 3, 4]],
      ['not all numbers', [1, '2', 3]],
      ['an object', {}],
      ['a number', 7],
    ])('faults a version that is %s', (_label, version) => {
      expect(fields(packManifest('behavior', { header: { uuid: 'u', version } }))).toEqual(['header.version'])
    })

    it('tests form and never value', () => {
      const manifest = packManifest('behavior', {
        format_version: 99,
        header: { uuid: 'not-a-8-4-4-4-12-uuid', version: 'banana' },
        modules: [{ type: 'a-type-no-list-carries' }],
      })

      expect(fields(manifest)).toEqual([])
    })

    it('never faults an absent field', () => {
      expect(fields({ header: {}, modules: [{}], dependencies: [{ uuid: 'u' }] })).toEqual([])
    })

    it('reports every fault a manifest carries, one per field', () => {
      const manifest = packManifest('behavior', {
        format_version: {},
        header: { uuid: 42, name: 7 },
        modules: [{ type: 'data', uuid: 7 }],
      })

      expect(faults(manifest)).toEqual(['format_version', 'header.name', 'header.uuid', 'modules[0].uuid'])
    })
  })

  describe('the dependency discriminator', () => {
    it.each([
      ['both a uuid and a module_name', { uuid: 'u', module_name: '@minecraft/server' }],
      ['neither', { version: '1.0.0' }],
    ])('form-checks no field of an entry carrying %s', (_label, dependency) => {
      expect(fields(withDependency({ ...dependency, version: {} }))).toEqual([])
    })

    it('reads presence, before any form check', () => {
      expect(classifyDependency({ uuid: 42 })).toBe('pack')
      expect(classifyDependency({ module_name: 42 })).toBe('module')
      expect(classifyDependency({ uuid: 'u', module_name: 'm' })).toBe('malformed')
      expect(classifyDependency({ version: '1.0.0' })).toBe('malformed')
    })
  })
})
