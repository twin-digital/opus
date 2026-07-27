import { describe, expect, it } from 'vitest'
import { packManifest, workingEntry } from '../../test/fixture.js'
import type { WorkingEntry } from './candidate.js'
import { validatePacks } from './pack-validation.js'

/** Validates a set and hands back the first entry, the one most cases are about. */
function validate(entry: WorkingEntry, ...rest: WorkingEntry[]): WorkingEntry {
  validatePacks([entry, ...rest])
  return entry
}

const codes = (entry: WorkingEntry): string[] => entry.problems.map((problem) => problem.code)

/** A pack of the given kind whose manifest is already completed, as validation meets it. */
function pack(
  kind: 'behavior' | 'resource',
  { uuid, ...overrides }: { uuid?: string } & Record<string, unknown> = {},
  packageDir = 'packages/mc-pack-1',
): WorkingEntry {
  return workingEntry({
    kind,
    packageDir,
    manifest: packManifest(kind, {
      header: { uuid: uuid ?? `uuid-${packageDir}`, name: 'Pack', version: '1.0.0' },
      ...overrides,
    }),
  })
}

describe('validatePacks', () => {
  describe('per pack', () => {
    it('reports a manifest declaring no header.uuid', () => {
      const entry = validate(workingEntry({ manifest: packManifest('behavior', { header: { name: 'Pack' } }) }))

      expect(codes(entry)).toContain('manifest-missing-uuid')
    })

    it('reports a header uuid that is not a string', () => {
      const entry = validate(workingEntry({ manifest: packManifest('behavior', { header: { uuid: 17 } }) }))

      expect(codes(entry)).toContain('manifest-missing-uuid')
    })

    it('reports every module declaring no type', () => {
      const entry = validate(pack('behavior', { modules: [{ type: 'data' }, { uuid: 'm2' }, { uuid: 'm3' }] }))

      expect(entry.problems).toContainEqual({
        code: 'module-missing-type',
        message: expect.any(String),
        field: 'modules[1]',
      })
      expect(entry.problems.filter((problem) => problem.code === 'module-missing-type')).toHaveLength(2)
    })

    it.each(['data', 'script'])('accepts a behavior pack corroborated by a %s module', (type) => {
      expect(codes(validate(pack('behavior', { modules: [{ type }] })))).toEqual([])
    })

    it('accepts a resource pack corroborated by a resources module', () => {
      expect(codes(validate(pack('resource', { modules: [{ type: 'resources' }] })))).toEqual([])
    })

    it.each([
      ['behavior', [{ type: 'client_data' }]],
      ['resource', [{ type: 'client_data' }]],
    ] as const)('reports an uncorroborated %s pack', (kind, modules) => {
      expect(codes(validate(pack(kind, { modules })))).toContain('kind-not-corroborated')
    })

    it.each([
      ['absent', undefined],
      ['empty', []],
    ])('reports a manifest whose modules are %s as uncorroborated only', (_label, modules) => {
      const entry = validate(pack('behavior', { modules }))

      expect(codes(entry)).toEqual(['kind-not-corroborated'])
    })

    it('reports a module of the other kind', () => {
      const behavior = validate(pack('behavior', { modules: [{ type: 'data' }, { type: 'resources' }] }))
      const resource = validate(pack('resource', { modules: [{ type: 'resources' }, { type: 'script' }] }))

      expect(behavior.problems).toContainEqual({
        code: 'foreign-kind-module',
        message: expect.any(String),
        field: 'modules[1]',
        type: 'resources',
      })
      expect(resource.problems).toContainEqual(expect.objectContaining({ code: 'foreign-kind-module', type: 'script' }))
    })

    it.each(['client_data', 'world_template', 'persona_piece'])(
      'ignores a %s module, which neither corroborates nor faults',
      (type) => {
        const entry = validate(pack('behavior', { modules: [{ type: 'data' }, { type }] }))

        expect(codes(entry)).toEqual([])
      },
    )

    it('leaves a pack with no problems valid', () => {
      expect(codes(validate(pack('behavior')))).toEqual([])
    })
  })

  describe('across the set', () => {
    it('reports every claimant of a duplicated uuid, naming them all', () => {
      const first = pack('behavior', { uuid: 'shared' }, 'packages/one')
      const second = pack('behavior', { uuid: 'shared' }, 'packages/two')
      validatePacks([first, second])

      const claimants = ['packages/one/behavior_pack', 'packages/two/behavior_pack']
      for (const entry of [first, second]) {
        expect(entry.problems).toContainEqual({
          code: 'duplicate-uuid',
          message: expect.any(String),
          uuid: 'shared',
          claimants,
        })
      }
    })

    it('compares claimed uuids case-insensitively', () => {
      const first = pack('behavior', { uuid: 'SHARED' }, 'packages/one')
      const second = pack('behavior', { uuid: 'shared' }, 'packages/two')
      validatePacks([first, second])

      expect(codes(first)).toContain('duplicate-uuid')
      expect(codes(second)).toContain('duplicate-uuid')
    })

    it('does not check module uuids for uniqueness', () => {
      const first = pack('behavior', { uuid: 'one', modules: [{ type: 'data', uuid: 'same-module' }] }, 'packages/one')
      const second = pack('behavior', { uuid: 'two', modules: [{ type: 'data', uuid: 'same-module' }] }, 'packages/two')
      validatePacks([first, second])

      expect(codes(first)).toEqual([])
      expect(codes(second)).toEqual([])
    })

    it('reports a dependency on a pack in the set that is invalid', () => {
      const broken = pack('behavior', { uuid: 'broken', modules: [] }, 'packages/broken')
      const dependent = pack(
        'behavior',
        { uuid: 'dependent', dependencies: [{ uuid: 'broken', version: '1.0.0' }] },
        'packages/dependent',
      )
      validatePacks([broken, dependent])

      expect(dependent.problems).toContainEqual({
        code: 'dependency-invalid',
        message: expect.any(String),
        field: 'dependencies[0]',
        uuid: 'broken',
      })
    })

    it('propagates invalidity along dependency edges to a fixpoint', () => {
      const c = pack('behavior', { uuid: 'c', modules: [] }, 'packages/c')
      const b = pack('behavior', { uuid: 'b', dependencies: [{ uuid: 'c', version: '1.0.0' }] }, 'packages/b')
      const a = pack('behavior', { uuid: 'a', dependencies: [{ uuid: 'b', version: '1.0.0' }] }, 'packages/a')
      validatePacks([a, b, c])

      expect(codes(a)).toContain('dependency-invalid')
      expect(codes(b)).toContain('dependency-invalid')
    })

    it('leaves a dependency cycle among otherwise sound packs valid', () => {
      const first = pack('behavior', { uuid: 'one', dependencies: [{ uuid: 'two', version: '1.0.0' }] }, 'packages/one')
      const second = pack(
        'behavior',
        { uuid: 'two', dependencies: [{ uuid: 'one', version: '1.0.0' }] },
        'packages/two',
      )
      validatePacks([first, second])

      expect(codes(first)).toEqual([])
      expect(codes(second)).toEqual([])
    })

    it.each([
      ['a built-in scripting module', { module_name: '@minecraft/server', version: '1.9.0' }],
      ['a uuid outside the set that carries its own version', { uuid: 'elsewhere', version: '2.0.0' }],
    ])('never invalidates a dependency on %s', (_label, dependencyEntry) => {
      const entry = pack('behavior', { uuid: 'one', dependencies: [dependencyEntry] })

      expect(codes(validate(entry))).toEqual([])
    })
  })
})
