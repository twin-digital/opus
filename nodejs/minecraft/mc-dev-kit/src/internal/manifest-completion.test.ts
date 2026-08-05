import { describe, expect, it } from 'vitest'
import { packManifest, workingEntry } from '../../test/fixture.js'
import type { WorkingEntry } from './candidate.js'
import { completeManifests } from './manifest-completion.js'

/** The completed manifest of a single entry, with its problems alongside. */
function complete(entry: WorkingEntry, ...rest: WorkingEntry[]): WorkingEntry {
  completeManifests([entry, ...rest])
  return entry
}

const header = (entry: WorkingEntry): Record<string, unknown> =>
  (entry.manifest as { header: Record<string, unknown> }).header

const codes = (entry: WorkingEntry): string[] => entry.problems.map((problem) => problem.code)

/** A pack whose dependencies array is the one thing the case is about. */
const dependent = (dependencies: unknown[], overrides: Record<string, unknown> = {}): WorkingEntry =>
  workingEntry({ manifest: packManifest('behavior', { dependencies, ...overrides }) })

/** The pack a dependency case points at, owned by a package of its own. */
const dependency = (
  uuid: string,
  packageJson: Record<string, unknown> = { name: 'mc-pack-2', version: '4.5.6' },
): WorkingEntry =>
  workingEntry({
    packageDir: 'packages/mc-pack-2',
    packageJson,
    manifest: packManifest('behavior', { header: { uuid } }),
  })

describe('completeManifests', () => {
  describe('a faulted field', () => {
    it('is neither specified nor unspecified: header.name reports and completes nothing', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { header: { uuid: 'u', name: 7 } }),
          formFaults: ['header.name'],
        }),
      )

      expect(codes(entry)).not.toContain('header-name-specified')
      expect(header(entry).name).toBe(7)
    })

    it('skips the version completion and its specified-field error', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { header: { uuid: 'u', version: {} } }),
          formFaults: ['header.version'],
        }),
      )

      expect(codes(entry)).not.toContain('header-version-specified')
      expect(header(entry).version).toEqual({})
    })

    it('leaves a format_version the kit cannot read restricting nothing', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', {
            format_version: {},
            header: { uuid: 'u', version: [1, 2, 0] },
          }),
          formFaults: ['format_version'],
        }),
      )

      expect(codes(entry)).not.toContain('array-version-at-format-version-3')
    })

    it.each([
      ['uuid', { uuid: 42, version: '9.9.9' }, 'dependencies[0].uuid'],
      ['version', { uuid: 'dep-uuid', version: {} }, 'dependencies[0].version'],
    ])('skips every dependency check where the entry %s faulted', (_label, dep, fault) => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { dependencies: [dep] }),
          formFaults: [fault],
        }),
        dependency('dep-uuid'),
      )

      expect(codes(entry)).toEqual([])
    })

    it('skips external-dependency-version-missing where module_name faulted', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { dependencies: [{ module_name: 42 }] }),
          formFaults: ['dependencies[0].module_name'],
        }),
      )

      expect(codes(entry)).toEqual([])
    })
  })

  describe('header.name', () => {
    it('is completed from the package productName', () => {
      const entry = complete(workingEntry({ packageJson: { name: '@scope/mc-pack-1', productName: 'Pack One' } }))

      expect(header(entry).name).toBe('Pack One')
    })

    it('falls back to the package name with its npm scope stripped', () => {
      const entry = complete(workingEntry({ packageJson: { name: '@scope/mc-pack-1' } }))

      expect(header(entry).name).toBe('mc-pack-1')
    })

    it.each([
      ['absent', undefined],
      ['empty', ''],
      ['not a string', 42],
    ])('falls back, with no problem, for a productName that is %s', (_label, productName) => {
      const entry = complete(workingEntry({ packageJson: { name: 'mc-pack-1', productName, version: '1.0.0' } }))

      expect(header(entry).name).toBe('mc-pack-1')
      expect(codes(entry)).not.toContain('package-name-missing')
    })

    it('reports package-name-missing when the package declares no string name', () => {
      const entry = complete(
        workingEntry({
          packageDir: 'packages/nameless',
          packageJson: { version: '1.0.0' },
          packageName: 'nameless',
        }),
      )

      expect(codes(entry)).toContain('package-name-missing')
      expect(header(entry).name).toBe('nameless')
    })

    it.each([
      ['unreadable', undefined],
      ['not a JSON object', [1, 2, 3]],
    ])('reports package-name-missing where the manifest is %s', (_label, manifest) => {
      const entry = complete(workingEntry({ packageJson: { version: '1.0.0' }, manifest }))

      expect(codes(entry)).toContain('package-name-missing')
    })

    it('reports package-name-missing even where productName completed the header cleanly', () => {
      const entry = complete(workingEntry({ packageJson: { productName: 'Pack One', version: '1.0.0' } }))

      expect(header(entry).name).toBe('Pack One')
      expect(codes(entry)).toContain('package-name-missing')
    })

    it('completes an empty source header.name like an absent one', () => {
      const entry = complete(workingEntry({ manifest: packManifest('behavior', { header: { uuid: 'u', name: '' } }) }))

      expect(header(entry).name).toBe('mc-pack-1')
      expect(codes(entry)).not.toContain('header-name-specified')
    })

    it('reports any other present header.name, and completes it anyway', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { header: { uuid: 'u', name: 'Hand Written' } }),
        }),
      )

      expect(codes(entry)).toContain('header-name-specified')
      expect(header(entry).name).toBe('mc-pack-1')
    })
  })

  describe('header.version', () => {
    it.each([1, 2, 3])('is completed as a SemVer string at format_version %s', (format_version) => {
      const entry = complete(workingEntry({ manifest: packManifest('behavior', { format_version }) }))

      expect(header(entry).version).toBe('1.2.3')
      expect(codes(entry)).toEqual([])
    })

    it('completes a pre-release version like any other', () => {
      const entry = complete(workingEntry({ packageJson: { name: 'mc-pack-1', version: '2.0.0-beta.1' } }))

      expect(header(entry).version).toBe('2.0.0-beta.1')
    })

    it.each([
      ['absent', undefined],
      ['an empty string', ''],
      ['the string 0.0.0', '0.0.0'],
      ['the array [0, 0, 0]', [0, 0, 0]],
    ])('overwrites a source version that is %s, with no problem', (_label, version) => {
      const entry = complete(workingEntry({ manifest: packManifest('behavior', { header: { uuid: 'u', version } }) }))

      expect(header(entry).version).toBe('1.2.3')
      expect(codes(entry)).not.toContain('header-version-specified')
    })

    it('reports a present, non-placeholder source version', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { header: { uuid: 'u', version: [9, 9, 9] } }),
        }),
      )

      expect(codes(entry)).toContain('header-version-specified')
      expect(header(entry).version).toBe('1.2.3')
    })

    it('reports a package.json declaring no version', () => {
      const entry = complete(workingEntry({ packageJson: { name: 'mc-pack-1' } }))

      expect(entry.problems).toContainEqual({
        code: 'package-version-missing',
        message: expect.any(String),
        field: 'header.version',
        packageDir: 'packages/mc-pack-1',
      })
    })

    it('reports a package.json version that is not a version', () => {
      const entry = complete(workingEntry({ packageJson: { name: 'mc-pack-1', version: 'not-a-version' } }))

      expect(entry.problems).toContainEqual({
        code: 'package-version-invalid',
        message: expect.any(String),
        field: 'header.version',
        packageDir: 'packages/mc-pack-1',
        value: 'not-a-version',
      })
    })
  })

  describe('the manifest format version', () => {
    it.each([1, 2, 'weird', undefined])('passes %s through untouched', (format_version) => {
      const entry = complete(workingEntry({ manifest: packManifest('behavior', { format_version }) }))

      expect((entry.manifest as Record<string, unknown>).format_version).toBe(format_version)
    })

    it.each([
      ['a placeholder', [0, 0, 0]],
      ['a real version', [1, 2, 0]],
    ])('reports %s array header version at format_version 3', (_label, version) => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', { format_version: 3, header: { uuid: 'u', version } }),
        }),
      )

      expect(entry.problems).toContainEqual(
        expect.objectContaining({
          code: 'array-version-at-format-version-3',
          field: 'header.version',
        }),
      )
    })

    it.each([1, 2, undefined])('accepts an array version at format_version %s', (format_version) => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', {
            format_version,
            header: { uuid: 'u', version: [0, 0, 0] },
          }),
        }),
      )

      expect(codes(entry)).not.toContain('array-version-at-format-version-3')
    })

    it('reports an array version on a dependency entry, matched or not, at format_version 3', () => {
      const matched = complete(
        dependent([{ uuid: 'dep-uuid', version: [0, 0, 0] }], { format_version: 3 }),
        dependency('dep-uuid'),
      )
      const unmatched = complete(dependent([{ uuid: 'nobody', version: [1, 0, 0] }], { format_version: 3 }))

      for (const entry of [matched, unmatched]) {
        expect(entry.problems).toContainEqual(
          expect.objectContaining({
            code: 'array-version-at-format-version-3',
            field: 'dependencies[0].version',
          }),
        )
      }
    })

    it('never reads a modules version', () => {
      const entry = complete(
        workingEntry({
          manifest: packManifest('behavior', {
            format_version: 3,
            modules: [{ type: 'data', version: [1, 0, 0] }],
          }),
        }),
      )

      expect(codes(entry)).not.toContain('array-version-at-format-version-3')
    })
  })

  describe('workspace dependency versions', () => {
    const versionOf = (entry: WorkingEntry): unknown =>
      (entry.manifest as { dependencies: Record<string, unknown>[] }).dependencies[0]?.version

    it("completes an entry naming a pack in the set from that pack's package version", () => {
      const entry = complete(dependent([{ uuid: 'dep-uuid' }]), dependency('dep-uuid'))

      expect(versionOf(entry)).toBe('4.5.6')
      expect(codes(entry)).toEqual([])
    })

    it('matches the uuid with both sides lowercased', () => {
      const entry = complete(dependent([{ uuid: 'DEP-UUID' }]), dependency('dep-UUID'))

      expect(versionOf(entry)).toBe('4.5.6')
    })

    it.each([
      ['an empty string', ''],
      ['the string 0.0.0', '0.0.0'],
      ['the array [0, 0, 0]', [0, 0, 0]],
    ])('completes a placeholder version of %s with no problem', (_label, version) => {
      const entry = complete(dependent([{ uuid: 'dep-uuid', version }]), dependency('dep-uuid'))

      expect(versionOf(entry)).toBe('4.5.6')
      expect(codes(entry)).not.toContain('dependency-version-specified')
    })

    it('reports a specified version on a matched entry', () => {
      const entry = complete(dependent([{ uuid: 'dep-uuid', version: '9.9.9' }]), dependency('dep-uuid'))

      expect(entry.problems).toContainEqual({
        code: 'dependency-version-specified',
        message: expect.any(String),
        field: 'dependencies[0].version',
        uuid: 'dep-uuid',
      })
    })

    it('names the depended-on package when its version is missing or invalid', () => {
      const missing = complete(dependent([{ uuid: 'dep-uuid' }]), dependency('dep-uuid', { name: 'mc-pack-2' }))
      const invalid = complete(
        dependent([{ uuid: 'dep-uuid' }]),
        dependency('dep-uuid', { name: 'mc-pack-2', version: 'nope' }),
      )

      expect(missing.problems).toContainEqual({
        code: 'package-version-missing',
        message: expect.any(String),
        field: 'dependencies[0].version',
        packageDir: 'packages/mc-pack-2',
      })
      expect(invalid.problems).toContainEqual({
        code: 'package-version-invalid',
        message: expect.any(String),
        field: 'dependencies[0].version',
        packageDir: 'packages/mc-pack-2',
        value: 'nope',
      })
    })

    it('leaves no placeholder standing where the depended-on version could not be read', () => {
      const entry = complete(
        dependent([{ uuid: 'dep-uuid', version: [0, 0, 0] }]),
        dependency('dep-uuid', { name: 'mc-pack-2' }),
      )

      expect((entry.manifest as { dependencies: Record<string, unknown>[] }).dependencies[0]).toEqual({
        uuid: 'dep-uuid',
      })
    })

    it('reads the whole set before completing, so packs complete across packages', () => {
      const first = dependent([{ uuid: 'dep-uuid' }])
      const second = dependency('dep-uuid')
      completeManifests([second, first])

      expect(versionOf(first)).toBe('4.5.6')
    })

    it('indexes the uuids of invalid packs too', () => {
      const invalidPack = dependency('dep-uuid')
      invalidPack.problems.push({ code: 'manifest-missing-uuid', message: 'seeded' })

      const entry = complete(dependent([{ uuid: 'dep-uuid' }]), invalidPack)

      expect(versionOf(entry)).toBe('4.5.6')
    })
  })

  describe('dependencies the workspace does not complete', () => {
    it('leaves an unmatched uuid entry carrying its own version untouched', () => {
      const entry = complete(dependent([{ uuid: 'elsewhere', version: '3.0.0' }]))

      expect(codes(entry)).toEqual([])
      expect((entry.manifest as { dependencies: unknown[] }).dependencies[0]).toEqual({
        uuid: 'elsewhere',
        version: '3.0.0',
      })
    })

    it('reports an unmatched uuid entry carrying no version, naming both readings', () => {
      const entry = complete(dependent([{ uuid: 'ELSEWHERE' }]))

      expect(entry.problems).toContainEqual({
        code: 'dependency-unsatisfied',
        message: expect.stringContaining('either the uuid is wrong'),
        field: 'dependencies[0]',
        uuid: 'ELSEWHERE',
      })
    })

    it('leaves a module_name entry carrying a version untouched', () => {
      const entry = complete(dependent([{ module_name: '@minecraft/server', version: '1.9.0' }]))

      expect(codes(entry)).toEqual([])
    })

    it('reports a module_name entry carrying no version', () => {
      const entry = complete(dependent([{ module_name: '@minecraft/server' }]))

      expect(entry.problems).toContainEqual({
        code: 'external-dependency-version-missing',
        message: expect.any(String),
        field: 'dependencies[0].version',
        moduleName: '@minecraft/server',
      })
    })

    it.each([
      ['both a uuid and a module_name', { uuid: 'dep-uuid', module_name: '@minecraft/server' }],
      ['neither', { version: '1.0.0' }],
    ])('reports an entry carrying %s, and completes nothing on it', (_label, dependencyEntry) => {
      const entry = complete(dependent([dependencyEntry]), dependency('dep-uuid'))

      expect(entry.problems).toContainEqual({
        code: 'dependency-entry-malformed',
        message: expect.any(String),
        field: 'dependencies[0]',
      })
      expect(codes(entry)).toEqual(['dependency-entry-malformed'])
    })

    it("never reads the owning package.json's own dependencies", () => {
      const entry = complete(
        workingEntry({
          packageJson: {
            name: 'mc-pack-1',
            version: '1.2.3',
            dependencies: { '@minecraft/server': '2.0.0' },
          },
        }),
      )

      expect((entry.manifest as Record<string, unknown>).dependencies).toBeUndefined()
    })
  })
})

describe("a module's entry", () => {
  /** The completed modules of a behavior pack whose modules the case states. */
  const modulesOf = (modules: unknown[], formFaults: string[] = []): Record<string, unknown>[] => {
    const entry = complete(workingEntry({ manifest: packManifest('behavior', { modules }), formFaults }))
    return (entry.manifest as { modules: Record<string, unknown>[] }).modules
  }

  const problemsOf = (modules: unknown[], formFaults: string[] = []): WorkingEntry =>
    complete(workingEntry({ manifest: packManifest('behavior', { modules }), formFaults }))

  it("is written on a behavior pack's script module, computed from the kind", () => {
    const modules = modulesOf([{ type: 'script', uuid: 'm', version: [1, 0, 0] }])

    expect(modules[0]?.entry).toBe('scripts/main.js')
  })

  it('is reported and overwritten when the source specified it', () => {
    const entry = problemsOf([{ type: 'script', uuid: 'm', entry: 'scripts/elsewhere.js' }])

    expect(entry.problems).toContainEqual(
      expect.objectContaining({ code: 'module-entry-specified', field: 'modules[0].entry' }),
    )
    expect((entry.manifest as { modules: Record<string, unknown>[] }).modules[0]?.entry).toBe('scripts/main.js')
  })

  it('is dropped from a module that gets none, so a specified value never reaches the consumer', () => {
    const modules = modulesOf([{ type: 'data', uuid: 'm', entry: 'scripts/nope.js' }])

    expect(modules[0]).not.toHaveProperty('entry')
  })

  it('is reported once per module that specified one', () => {
    const entry = problemsOf([
      { type: 'script', uuid: 'a', entry: 'a.js' },
      { type: 'data', uuid: 'b', entry: 'b.js' },
    ])

    expect(
      entry.problems.filter((problem) => problem.code === 'module-entry-specified').map((problem) => problem.field),
    ).toEqual(['modules[0].entry', 'modules[1].entry'])
  })

  it('is not written on a resource pack, which has no script location', () => {
    const entry = complete(
      workingEntry({
        kind: 'resource',
        manifest: packManifest('resource', { modules: [{ type: 'script', uuid: 'm' }] }),
      }),
    )

    expect((entry.manifest as { modules: Record<string, unknown>[] }).modules[0]).not.toHaveProperty('entry')
  })

  it('suppresses only its own report when the source form faulted, and still completes', () => {
    const entry = problemsOf([{ type: 'script', uuid: 'm', entry: 7 }], ['modules[0].entry'])

    expect(codes(entry)).not.toContain('module-entry-specified')
    expect((entry.manifest as { modules: Record<string, unknown>[] }).modules[0]?.entry).toBe('scripts/main.js')
  })
})
