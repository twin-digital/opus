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
/**
 * Every behaviour the design ruled on, transcribed from the spec's own coverage table plus the
 * rulings made while building. The README is what ships to a reader who has the library in hand and
 * the spec nowhere near, so each of these must carry a row, and each divergence must carry a
 * section describing the difference.
 */
const COVERAGE_ROWS: readonly (readonly [subject: string, coverage: string])[] = [
  ['dimension registration and `world.getDimension` resolution', 'modelled'],
  ['`getDimension` with an unknown id', 'modelled'],
  ["the world's resting state — empty collections, no players, no objectives", 'modelled'],
  ["a freshly constructed entity's components", 'divergence'],
  ['the spawn frame of `minecraft:xp_orb`', 'divergence'],
  ["per-type vanilla data — a sheep's fourteen components, its 8/8/0/8 health", 'not modelled'],
  ['entity id assignment', 'divergence'],
  ['`world.getEntity`, `getAllPlayers`, `getPlayers`, `dimension.getEntities`, `dimension.getPlayers`', 'modelled'],
  ['`EntityQueryOptions` filtering, on the lookups and on `entity.matches`', 'divergence'],
  ['entity tags — `addTag`, `removeTag`, `hasTag`, `getTags`', 'modelled'],
  [
    'the other entity lookups — `getEntitiesAtBlockLocation`, `getEntitiesFromRay`, `getEntitiesFromViewDirection` and the rest',
    'not modelled',
  ],
  ['`dimension.spawnEntity` placement', 'divergence'],
  ['post-spawn motion', 'divergence'],
  ['`entity.remove()`', 'modelled'],
  ['`entity.triggerEvent`', 'divergence'],
  ['`entity.kill()`', 'modelled'],
  ['invalidation of a corpse after `kill()`', 'not modelled'],
  ['the seven attribute-shaped components', 'modelled'],
  ['the other 61 entity components', 'not modelled'],
  ['runtime component attachment and detachment', 'not modelled'],
  ['bare and prefixed id tolerance', 'modelled'],
  ['`setCurrentValue` bounds check', 'modelled'],
  ['`applyDamage` cascade, order and payloads', 'modelled'],
  ["`applyDamage`'s boolean", 'modelled'],
  ['`applyDamage` cause defaults and the `damagingEntity` carry-through', 'modelled'],
  ['the killing-hit boundary', 'modelled'],
  ['`applyDamage` on an entity with no health component', 'modelled'],
  ['the damage-invulnerability window', 'divergence'],
  ["the engine's velocity-dependent projectile damage adjustment", 'divergence'],
  ['`addEffect` / `getEffect` / `getEffects` / `removeEffect` and the amplifier-first replacement rule', 'modelled'],
  ["`addEffect`'s argument bounds", 'modelled'],
  ["`addEffect`'s non-integer arguments", 'modelled'],
  ['`addEffect` on `NaN` or `Infinity`', 'divergence'],
  ["the display name's amplifier mapping", 'modelled'],
  ['effect duration decay and expiry', 'divergence'],
  ['`Effect.displayName` for the 37 vanilla types', 'modelled'],
  ['`Effect.displayName` in a locale other than the observed one', 'divergence'],
  ['`Effect.displayName` for a custom effect type', 'divergence'],
  ['signal existence, `subscribe` / `unsubscribe`, reference dedupe and subscription order', 'modelled'],
  ['after-event dispatch timing', 'divergence'],
  ['engine-raised signals outside the five after-events and three before-events the fakes raise', 'not modelled'],
  ['before-event cancellation', 'modelled'],
  ['what a cancelled call returns', 'modelled'],
  ['before-event mutable payload fields', 'divergence'],
  ['a subscriber that throws', 'divergence'],
  ['the tick loop', 'divergence'],
  ['`run` / `runTimeout` / `runInterval` / `clearRun` scheduling', 'modelled'],
  ['`runJob` / `clearJob`', 'not modelled'],
  ['dynamic properties on the world and on entities', 'modelled'],
  ['`getDynamicPropertyTotalByteCount`', 'not modelled'],
  ['the scoreboard — objectives, scores, participants, display slots', 'modelled'],
  ['`sendMessage` and `onScreenDisplay` output', 'modelled'],
  ['the invalidation guard on entities, attribute components and effects', 'modelled'],
  ['reading — not calling — a guarded method on an invalidated reference', 'modelled'],
  ['too few arguments checked ahead of the validity guard', 'modelled'],
  ['extra arguments to a member', 'modelled'],
  ['`in` on a declared but unmodelled member', 'modelled'],
  ['`Object.keys`, spread and `JSON.stringify` over an entity', 'modelled'],
  ['`for-in` over an entity', 'modelled'],
  [
    'items, blocks, containers, the player client surface, custom commands, the startup registries, and the eight registry classes',
    'not modelled',
  ],
  ['a filtered subscription — any options argument to `subscribe`', 'divergence'],
  ['invalidation of a health-less corpse', 'divergence'],
  ['the basis the effect replacement rule compares on', 'divergence'],
]

describe('the README coverage table', () => {
  const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8')

  const rows = [...readme.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|\s*$/gm)]
    .map((match) => ({
      subject: match[1].trim(),
      coverage: match[2].trim(),
      description: match[3].trim(),
    }))
    .filter((row) => ['modelled', 'not modelled', 'divergence'].includes(row.coverage))

  const divergences = COVERAGE_ROWS.filter(([, coverage]) => coverage === 'divergence')

  it('carries a row for every behaviour the design ruled on', () => {
    const subjects = new Set(rows.map((row) => row.subject))
    expect(COVERAGE_ROWS.map(([subject]) => subject).filter((subject) => !subjects.has(subject))).toEqual([])
    expect(COVERAGE_ROWS).toHaveLength(63)
  })

  it('gives every row the coverage the design ruled on', () => {
    const bySubject = new Map(rows.map((row) => [row.subject, row]))
    const wrong = COVERAGE_ROWS.filter(([subject, coverage]) => bySubject.get(subject)?.coverage !== coverage).map(
      ([subject, coverage]) => `${subject}: expected ${coverage}, read ${String(bySubject.get(subject)?.coverage)}`,
    )
    expect(wrong).toEqual([])
  })

  it('carries no row the design did not rule on', () => {
    const ruled = new Set(COVERAGE_ROWS.map(([subject]) => subject))
    expect(rows.map((row) => row.subject).filter((subject) => !ruled.has(subject))).toEqual([])
  })

  it('carries the difference itself on every divergence row', () => {
    const bySubject = new Map(rows.map((row) => [row.subject, row]))
    const bare = divergences
      .map(([subject]) => subject)
      .filter((subject) => (bySubject.get(subject)?.description.length ?? 0) < 40)
    expect(bare).toEqual([])
  })

  it('carries the twenty divergences the design named', () => {
    expect(divergences).toHaveLength(20)
    expect(rows.filter((row) => row.coverage === 'divergence')).toHaveLength(20)
  })

  it('describes every divergence in a section of its own, named for its row', () => {
    const start = readme.search(/^## Divergences in detail$/m)
    expect(start).toBeGreaterThanOrEqual(0)
    const headings = new Set([...readme.slice(start).matchAll(/^### (.+)$/gm)].map((match) => match[1].trim()))
    expect(divergences.map(([subject]) => subject).filter((subject) => !headings.has(subject))).toEqual([])
    expect(headings.size).toBe(divergences.length)
  })

  it('carries the two divergences the spec has not yet stated', () => {
    // Both escalated to the spec's owner; the README is where their absence bites a reader.
    const subjects = rows.map((row) => row.subject)
    expect(subjects).toContain('invalidation of a health-less corpse')
    expect(subjects).toContain('the basis the effect replacement rule compares on')
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
