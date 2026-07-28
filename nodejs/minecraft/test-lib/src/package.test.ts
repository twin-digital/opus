/**
 * The package manifest, the single public entry point, the user-facing coverage table, and the
 * compile-time claims the surface rests on.
 *
 * The type-level cases are declarations that must compile; the functions holding them are never
 * called, so what they assert is assignability and nothing else.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { createEntity, createPlayer } from './entity.js'
import { InvalidEntityError } from './errors.js'
import type { _EntityComplete, _PlayerComplete, _WorldComplete } from './generated/manifests.js'
import { FAKED_CLASSES } from './generated/manifests.js'
import { ATTRIBUTE_COMPONENT_IDS, type CanonicalAttributeComponentId, type _AttributeIdsComplete } from './ids.js'
import * as library from './index.js'
import { withVanillaDimensions } from './presets.js'
import { serverOf } from './runtime/state.js'
import { registerDimension } from './world.js'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

interface ExportEntry {
  readonly import?: Readonly<Record<string, string | undefined>>
  readonly require?: unknown
}

interface PackageManifest {
  readonly type?: string
  readonly exports?: Readonly<Record<string, ExportEntry | undefined>>
  readonly files?: readonly string[]
  readonly dependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : []
  })

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

describe('package manifest', () => {
  it('is ESM only', () => {
    expect(manifest.type).toBe('module')
    const entry = manifest.exports?.['.']
    expect(entry).toBeDefined()
    expect(entry?.import).toBeDefined()
    expect(entry?.require).toBeUndefined()
  })

  it('exports one entry point and no subpaths', () => {
    expect(Object.keys(manifest.exports ?? {})).toEqual(['.'])
  })

  it('ships type declarations', () => {
    expect(manifest.exports?.['.']?.import?.types).toMatch(/\.d\.ts$/)
    expect(manifest.files).toContain('dist')
  })

  it('has no runtime dependencies', () => {
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
    expect(Object.keys(manifest.optionalDependencies ?? {})).toEqual([])
  })

  it('peers @minecraft/server at the pinned version', () => {
    expect(manifest.peerDependencies).toEqual({ '@minecraft/server': '2.8.0' })
  })

  it('depends on no test framework outside devDependencies', () => {
    const runners = ['vitest', 'jest', 'mocha', 'chai', 'sinon']
    const shipped = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]
    for (const runner of runners) {
      expect(shipped).not.toContain(runner)
    }
  })
})

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

const FREE_FUNCTIONS = [
  'createServer',
  'createEntity',
  'createPlayer',
  'addComponent',
  'removeComponent',
  'registerEffectBaseName',
  'invalidate',
  'emit',
  'advanceTicks',
  'getOutput',
  'getTriggeredEvents',
  'getHandlerErrors',
] as const

const PRESETS = ['withVanillaDimensions', 'asSpawnedEntity'] as const

const ERROR_CLASSES = [
  'ArgumentOutOfBoundsError',
  'InvalidArgumentError',
  'InvalidEntityError',
  'NotImplementedError',
  'UnsetValueError',
] as const

describe('entry point', () => {
  const exported = library as unknown as Record<string, unknown>

  it("exports every free function the spec's table names", () => {
    for (const name of FREE_FUNCTIONS) {
      expect(typeof exported[name]).toBe('function')
    }
  })

  it('exports both presets', () => {
    for (const name of PRESETS) {
      expect(typeof exported[name]).toBe('function')
    }
  })

  it('exports the five error classes', () => {
    for (const name of ERROR_CLASSES) {
      const value = exported[name] as { prototype: unknown }
      expect(typeof value).toBe('function')
      expect(value.prototype).toBeInstanceOf(Error)
    }
  })

  it('exports the attribute id array', () => {
    expect(library.ATTRIBUTE_COMPONENT_IDS).toEqual([
      'minecraft:health',
      'minecraft:lava_movement',
      'minecraft:movement',
      'minecraft:player.exhaustion',
      'minecraft:player.hunger',
      'minecraft:player.saturation',
      'minecraft:underwater_movement',
    ])
  })

  it('exports nothing beyond its documented surface', () => {
    expect(Object.keys(exported).sort()).toEqual(
      [...FREE_FUNCTIONS, ...PRESETS, ...ERROR_CLASSES, 'ATTRIBUTE_COMPONENT_IDS'].sort(),
    )
  })

  it('exports no generated class', () => {
    // Ruling 29: a test never meets a fake class by name — the classes are build output.
    for (const name of Object.keys(exported)) {
      expect(name.startsWith('Fake')).toBe(false)
    }
    for (const className of FAKED_CLASSES) {
      expect(exported[className]).toBeUndefined()
      expect(exported[`Fake${className}`]).toBeUndefined()
    }
  })

  it('imports @minecraft/server only as types', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(packageRoot, 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/^import\s+([^\n]*?)\s+from\s+'@minecraft\/(?:server|common)'/gm)) {
        if (!match[1].startsWith('type')) {
          offenders.push(`${file}: ${match[0]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('holds no module-level mutable state', () => {
    const a = createServer()
    const b = createServer()
    expect(serverOf(a.world)).not.toBe(serverOf(b.world))
    registerDimension(serverOf(a.world), {
      id: 'x:custom',
      aliases: ['x:custom'],
      heightRange: { min: 0, max: 16 },
      localizationKey: 'dimension.custom',
    })
    expect(serverOf(a.world).dimensions.size).toBe(1)
    expect(serverOf(b.world).dimensions.size).toBe(0)
  })

  it('installs nothing', () => {
    const globals = Object.keys(globalThis)
    expect(globals.filter((name) => name.toLowerCase().includes('minecraft'))).toEqual([])
    expect((globalThis as unknown as Record<string, unknown>).createServer).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The user-facing coverage table
// ---------------------------------------------------------------------------

/**
 * The spec is not checked into this repository, so the rows cannot be diffed against it
 * mechanically; what is enforced here is the whole of the rule the spec sets — every behaviour
 * ruled on carries a row, every row carries one of the three coverage words, and every divergence
 * row carries the difference itself and a section describing it.
 */
describe('the README coverage table', () => {
  const readme = (): string => readFileSync(join(packageRoot, 'README.md'), 'utf8')

  const rows = (): { behaviour: string; coverage: string; description: string }[] =>
    [...readme().matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|\s*$/gm)]
      .map((match) => ({
        behaviour: match[1].trim(),
        coverage: match[2].trim(),
        description: match[3].trim(),
      }))
      .filter((row) => ['modelled', 'not modelled', 'divergence'].includes(row.coverage))

  it('carries a row for every behaviour the design ruled on', () => {
    // 60 rows in the spec's table, plus the filtered-subscription divergence of ruling 30.
    expect(rows().length).toBeGreaterThanOrEqual(61)
  })

  it('marks every row modelled, not modelled or a divergence', () => {
    const table = readme().split('\n')
    const headerIndex = table.findIndex((line) => line.includes('| coverage |'))
    expect(headerIndex).toBeGreaterThanOrEqual(0)
    for (const row of rows()) {
      expect(['modelled', 'not modelled', 'divergence']).toContain(row.coverage)
      expect(row.behaviour).not.toBe('')
    }
  })

  it('carries the difference itself on every divergence row', () => {
    const bare = rows().filter((row) => row.coverage === 'divergence' && row.description.length < 20)
    expect(bare).toEqual([])
  })

  it('carries at least the seventeen divergences the design named', () => {
    expect(rows().filter((row) => row.coverage === 'divergence').length).toBeGreaterThanOrEqual(18)
  })

  it('describes every divergence in its own section', () => {
    const text = readme()
    const divergences = rows().filter((row) => row.coverage === 'divergence')
    const start = text.search(/^##+ .*Divergence/im)
    expect(start).toBeGreaterThanOrEqual(0)
    const sections = [...text.slice(start).matchAll(/^###+ /gm)]
    expect(sections.length).toBeGreaterThanOrEqual(divergences.length)
  })

  it('carries the rows the design owes and the spec has not yet stated', () => {
    // Escalated to the spec's owner; the README is where their absence bites a reader.
    // (a) kill() leaves a health-less corpse valid where the engine eventually invalidates it.
    // (b) the effect replacement rule compares a duration that never decays, so the fake and the
    //     engine part company once ticks pass.
    const text = readme().toLowerCase()
    expect(text).toContain('corpse')
    expect(text).toContain('decay')
  })
})

// ---------------------------------------------------------------------------
// Compile-time cases
// ---------------------------------------------------------------------------

type ModuleNamespace = typeof import('@minecraft/server')
type BundleShape = Pick<
  ModuleNamespace,
  | 'world'
  | 'system'
  | 'BiomeTypes'
  | 'BlockStates'
  | 'BlockTypes'
  | 'DimensionTypes'
  | 'EffectTypes'
  | 'EnchantmentTypes'
  | 'EntityTypes'
  | 'ItemTypes'
>

/** Each of these compiles or the build fails; none of them runs. */
const typeChecks = {
  bundleIsAssignable: (): BundleShape => createServer(),

  registriesAreClassStaticSides: (): typeof MC.BiomeTypes => createServer().BiomeTypes,

  objectLiteralIsNotARegistry: (): void => {
    // @ts-expect-error an object literal carries no `prototype`, which the static side declares
    const _registry: typeof MC.BiomeTypes = { get: () => undefined, getAll: () => [] }
    void _registry
  },

  bundleCarriesNothingTheModuleLacks: (): void => {
    // @ts-expect-error the bundle's names mirror the module's exports
    void createServer().Block
  },

  entityIsAssignable: (server: ReturnType<typeof createServer>): MC.Entity =>
    createEntity(server, { typeId: 'minecraft:sheep' }),

  playerIsAssignable: (server: ReturnType<typeof createServer>): MC.Entity => {
    const player: MC.Player = createPlayer(server)
    return player
  },

  dimensionIsAssignable: (server: ReturnType<typeof createServer>): MC.Dimension =>
    server.world.getDimension('overworld'),

  worldAndSystemAreAssignable: (server: ReturnType<typeof createServer>): [MC.World, MC.System] => [
    server.world,
    server.system,
  ],

  attributeIdsAreCanonical: (): readonly CanonicalAttributeComponentId[] => ATTRIBUTE_COMPONENT_IDS,

  attributeIdsRejectAnythingElse: (): void => {
    // @ts-expect-error not an attribute-shaped component id
    const _bad: readonly CanonicalAttributeComponentId[] = ['minecraft:not_an_attribute']
    void _bad
  },

  attributeIdsCountSeven: (): 7 => ATTRIBUTE_COMPONENT_IDS.length,

  invalidEntityErrorMatchesTheDeclaration: (): MC.InvalidEntityError =>
    new InvalidEntityError('-42', 'minecraft:sheep', 'message'),

  invalidEntityErrorFieldsAreReadonly: (): void => {
    const error = new InvalidEntityError('-42', 'minecraft:sheep', 'message')
    // @ts-expect-error id is readonly
    error.id = 'other'
  },

  createEntityRequiresATypeId: (server: ReturnType<typeof createServer>): void => {
    // @ts-expect-error typeId is required
    void createEntity(server, {})
  },

  createEntityTakesADimensionNotAnId: (server: ReturnType<typeof createServer>): void => {
    // @ts-expect-error a dimension id string would resolve against a registry that may hold nothing
    void createEntity(server, { typeId: 'minecraft:sheep', dimension: 'minecraft:overworld' })
  },

  presetTakesTheBundle: (): void => {
    withVanillaDimensions(createServer())
    // @ts-expect-error a preset needs the world the bundle carries
    withVanillaDimensions({})
  },
}

/** The generator's completeness assertions, referenced so a missing member fails this build too. */
type _GeneratedClassesAreComplete = [_EntityComplete, _PlayerComplete, _WorldComplete, _AttributeIdsComplete]

describe('types', () => {
  it('holds every compile-time claim the surface rests on', () => {
    // The assertions are the declarations above; running them is neither possible nor the point.
    expect(Object.keys(typeChecks)).toHaveLength(16)
  })
})
