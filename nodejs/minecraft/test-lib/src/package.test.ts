/**
 * The package manifest, the single public entry point, the user-facing coverage table, and the
 * compile-time claims the surface rests on.
 *
 * The type-level cases are declarations that must compile; the functions holding them are never
 * called, so what they assert is assignability and nothing else.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { createEntity, createPlayer } from './entity.js'
import { InvalidEntityError } from './errors.js'
import type { _EntityComplete, _PlayerComplete, _WorldComplete } from './generated/manifests.js'
import { FAKED_CLASSES } from './generated/manifests.js'
import { SERVER_VERSION } from './generated/shim/version.js'
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
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean } | undefined>>
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

  it('exports the root barrel and one runner-tooling subpath, and nothing else', () => {
    expect(Object.keys(manifest.exports ?? {})).toEqual(['.', './vitest'])
  })

  it('publishes neither the aliased surface nor the sibling stubs as a subpath', () => {
    const paths = Object.keys(manifest.exports ?? {})
    expect(paths.some((path) => path.includes('shim') || path.includes('server-ui'))).toBe(false)
    expect(paths.some((path) => path.includes('*'))).toBe(false)
  })

  it('ships type declarations', () => {
    expect(manifest.exports?.['.']?.import?.types).toMatch(/\.d\.ts$/)
    expect(manifest.files).toContain('dist')
  })

  it('has no runtime dependencies', () => {
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
    expect(Object.keys(manifest.optionalDependencies ?? {})).toEqual([])
  })

  it('declares no @minecraft/server peer range — nothing gates an install on an engine pin', () => {
    expect(Object.keys(manifest.peerDependencies ?? {})).not.toContain('@minecraft/server')
  })

  it('states the derived version inertly, and compares it to nothing', () => {
    expect(SERVER_VERSION).toBe('2.8.0')
    const offenders: string[] = []
    for (const file of sourceFiles(join(packageRoot, 'src'))) {
      if (file.endsWith('.test.ts')) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      if (/SERVER_VERSION\s*[!=]==?/.test(source) || /console\.(warn|error)/.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('makes a test framework an optional peer, reached only from the runner subpath', () => {
    const runners = ['jest', 'mocha', 'chai', 'sinon']
    const shipped = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]
    for (const runner of runners) {
      expect(shipped).not.toContain(runner)
    }
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('vitest')
    expect(manifest.peerDependenciesMeta?.vitest?.optional).toBe(true)

    const offenders: string[] = []
    for (const file of sourceFiles(join(packageRoot, 'src'))) {
      if (file.endsWith('.test.ts') || file.includes(`${sep}vitest${sep}`)) {
        continue
      }
      if (/from '(vitest|jest|mocha|chai|sinon)'/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
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
  'registerEntityType',
  'invalidate',
  'emit',
  'advanceTicks',
  'getOutput',
  'getTriggeredEvents',
  'getHandlerErrors',
] as const

const PRESETS = ['withVanillaDimensions', 'withVanillaEntityTypes', 'withVanillaWorld', 'asSpawnedEntity'] as const

const ERROR_CLASSES = [
  'ArgumentOutOfBoundsError',
  'InvalidArgumentError',
  'InvalidEntityError',
  'NotImplementedError',
  'ShimNotInstalledError',
  'ShimServerInUseError',
  'UnsetValueError',
] as const

/** What the root barrel adds for the module-import route. */
const SHIM_CONTROLS = ['__useServer', 'currentServer'] as const

describe('entry point', () => {
  const exported = library as unknown as Record<string, unknown>

  it("exports every free function the spec's table names", () => {
    for (const name of FREE_FUNCTIONS) {
      expect(typeof exported[name]).toBe('function')
    }
  })

  it('exports the four presets', () => {
    for (const name of PRESETS) {
      expect(typeof exported[name]).toBe('function')
    }
  })

  it('exports the error classes', () => {
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

  it('exports the shim controls', () => {
    for (const name of SHIM_CONTROLS) {
      expect(typeof exported[name]).toBe('function')
    }
  })

  it('exports nothing beyond its documented surface', () => {
    expect(Object.keys(exported).sort()).toEqual(
      [
        ...FREE_FUNCTIONS,
        ...PRESETS,
        ...ERROR_CLASSES,
        ...SHIM_CONTROLS,
        'ATTRIBUTE_COMPONENT_IDS',
        'SERVER_VERSION',
      ].sort(),
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

  it('holds no module-level mutable state beyond the bindings a test installs', () => {
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
 * ruled on carries a row, every row carries a unique id and one of the three coverage words, and
 * every divergence row carries the difference itself and a section describing it.
 *
 * Every behaviour the design ruled on, transcribed from the spec's own coverage table. Each entry is
 * the row's stable id, the engine behaviour it names, and its coverage word. The README is what
 * ships to a reader who has the library in hand and the spec nowhere near, so each of these must
 * carry a row, and each divergence must carry a section describing the difference.
 *
 * The id is the row's identity; the two description columns are not. A reworded behaviour column is
 * updated here alongside the README, while an id that changes means a row was split, removed or
 * added, and the change is real.
 */
/**
 * Divergences the library ships that the design's coverage table does not carry a row for.
 *
 * `r:coverage-is-enumerated` binds the package, not the design: a user meeting one of these without
 * warning is the failure the requirement exists to prevent, so the README would document it even
 * while the design was silent. The list is asserted exactly so it cannot grow quietly. It is empty:
 * the one entry it held — a filtered subscription throwing outright — is the design's own ruling
 * now, and the row moved into the table below.
 */
const LIBRARY_RULINGS: readonly (readonly [id: string, subject: string, coverage: string])[] = []

const COVERAGE_ROWS: readonly (readonly [id: string, subject: string, coverage: string])[] = [
  ['dimension-registration-and-resolution', 'dimension registration and `world.getDimension` resolution', 'modelled'],
  ['get-dimension-unknown-id', '`getDimension` with an unknown id', 'modelled'],
  ['world-resting-state', "the world's resting state — empty collections, no players, no objectives", 'modelled'],
  ['fresh-entity-components', "a freshly constructed entity's components", 'divergence'],
  ['xp-orb-spawn-frame', 'the spawn frame of `minecraft:xp_orb`', 'divergence'],
  [
    'per-type-vanilla-data',
    "per-type vanilla data — a sheep's fourteen components, its 8/8/0/8 health",
    'not modelled',
  ],
  ['entity-id-assignment', 'entity id assignment', 'divergence'],
  [
    'entity-lookups',
    '`world.getEntity`, `getAllPlayers`, `getPlayers`, `dimension.getEntities`, `dimension.getPlayers`',
    'modelled',
  ],
  [
    'entity-query-options-filtering',
    '`EntityQueryOptions` filtering, on the lookups and on `entity.matches`',
    'divergence',
  ],
  ['entity-tags', 'entity tags — `addTag`, `removeTag`, `hasTag`, `getTags`', 'modelled'],
  [
    'positional-entity-lookups',
    'the other entity lookups — `getEntitiesAtBlockLocation`, `getEntitiesFromRay`, `getEntitiesFromViewDirection` and the rest',
    'not modelled',
  ],
  ['spawn-entity-placement', '`dimension.spawnEntity` placement', 'divergence'],
  ['post-spawn-motion', 'post-spawn motion', 'divergence'],
  ['entity-type-catalog', '`EntityTypes.get` and `EntityTypes.getAll`', 'modelled'],
  ['entity-type-registration', 'how an entity type gets into the catalog', 'divergence'],
  ['entity-type-catalog-early-execution', 'a catalog read during early execution', 'divergence'],
  ['entity-type-argument-guards', '`EntityTypes.get` on a wrong-typed argument', 'divergence'],
  ['entity-type-shape', "an `EntityType`'s `id` and `localizationKey`", 'modelled'],
  ['spawn-entity-type-resolution', '`dimension.spawnEntity` entity-type resolution', 'modelled'],
  ['create-entity-type-resolution', '`createEntity` and `createPlayer` entity-type resolution', 'not modelled'],
  ['entity-remove-cascade', '`entity.remove()`', 'modelled'],
  ['trigger-event', '`entity.triggerEvent`', 'divergence'],
  ['entity-kill-cascade', '`entity.kill()`', 'modelled'],
  ['corpse-invalidation-after-kill', "invalidation of a mob's corpse after `kill()`", 'modelled'],
  ['kill-invalidation-without-health', 'invalidation after `kill()` on an entity with no health component', 'modelled'],
  ['attribute-shaped-components', 'the seven attribute-shaped components', 'modelled'],
  ['non-attribute-components', 'the other 61 entity components', 'not modelled'],
  ['runtime-component-mutation', 'runtime component attachment and detachment', 'not modelled'],
  ['namespace-prefix-tolerance', 'bare and prefixed id tolerance', 'modelled'],
  ['set-current-value-bounds', '`setCurrentValue` bounds check', 'modelled'],
  ['apply-damage-cascade', '`applyDamage` cascade, order and payloads', 'modelled'],
  ['apply-damage-boolean', "`applyDamage`'s boolean", 'modelled'],
  ['apply-damage-cause-and-source', '`applyDamage` cause defaults and the `damagingEntity` carry-through', 'modelled'],
  ['killing-hit-boundary', 'the killing-hit boundary', 'modelled'],
  ['apply-damage-without-health', '`applyDamage` on an entity with no health component', 'modelled'],
  ['damage-invulnerability-window', 'the damage-invulnerability window', 'divergence'],
  ['projectile-damage-adjustment', "the engine's velocity-dependent projectile damage adjustment", 'divergence'],
  [
    'effect-add-and-replacement-rule',
    '`addEffect` / `getEffect` / `getEffects` / `removeEffect` and the amplifier-first replacement rule',
    'modelled',
  ],
  ['add-effect-argument-bounds', "`addEffect`'s argument bounds", 'modelled'],
  ['add-effect-non-integer-arguments', "`addEffect`'s non-integer arguments", 'modelled'],
  ['add-effect-nan-and-infinity', '`addEffect` on `NaN` or `Infinity`', 'divergence'],
  ['display-name-amplifier-mapping', "the display name's amplifier mapping", 'modelled'],
  ['effect-duration-decay', 'effect duration decay', 'modelled'],
  ['effect-duration-expiry-boundary', 'what the engine does when a duration reaches zero', 'modelled'],
  ['vanilla-effect-display-names', '`Effect.displayName` for the 37 vanilla types', 'modelled'],
  ['effect-display-name-locale', '`Effect.displayName` in a locale other than the observed one', 'divergence'],
  ['custom-effect-display-name', '`Effect.displayName` for a custom effect type', 'divergence'],
  [
    'signal-subscription',
    'signal existence, `subscribe` / `unsubscribe`, reference dedupe and subscription order',
    'modelled',
  ],
  ['filtered-subscription', 'a filtered subscription — an options argument to `subscribe`', 'modelled'],
  ['after-event-dispatch-timing', 'after-event dispatch timing', 'divergence'],
  [
    'unraised-engine-signals',
    'engine-raised signals outside the five after-events and three before-events the fakes raise',
    'not modelled',
  ],
  ['before-event-cancellation', 'before-event cancellation', 'modelled'],
  ['cancelled-call-return-value', 'what a cancelled call returns', 'modelled'],
  ['before-event-payload-writes', 'before-event mutable payload fields', 'divergence'],
  ['throwing-subscriber', 'a subscriber that throws', 'divergence'],
  ['tick-loop', 'the tick loop', 'divergence'],
  ['system-scheduling', '`run` / `runTimeout` / `runInterval` / `clearRun` scheduling', 'modelled'],
  ['run-job', '`runJob` / `clearJob`', 'not modelled'],
  ['dynamic-properties', 'dynamic properties on the world and on entities', 'modelled'],
  ['dynamic-property-byte-count', '`getDynamicPropertyTotalByteCount`', 'not modelled'],
  ['scoreboard', 'the scoreboard — objectives, scores, participants, display slots', 'modelled'],
  ['message-and-title-output', '`sendMessage` and `onScreenDisplay` output', 'modelled'],
  ['invalidation-guard', 'the invalidation guard on entities, attribute components and effects', 'modelled'],
  ['guard-fires-at-call', 'reading — not calling — a guarded method on an invalidated reference', 'modelled'],
  ['arity-before-guard', 'argument count checked ahead of the validity guard', 'modelled'],
  ['extra-arguments', 'extra arguments to a member', 'modelled'],
  ['in-operator-on-members', '`in` on a declared but unmodelled member', 'modelled'],
  ['own-enumerable-properties', '`Object.keys`, spread and `JSON.stringify` over an entity', 'modelled'],
  ['for-in-enumeration', '`for-in` over an entity', 'modelled'],
  [
    'out-of-scope-surfaces',
    'items, blocks, containers, the player client surface, custom commands, the startup registries, and the seven type catalogs beside `EntityTypes`',
    'not modelled',
  ],
  ['module-import-resolution', "a pack's `import` of `@minecraft/server`", 'modelled'],
  ['module-singleton-bindings', 'the module-scope `world`, `system` and `EntityTypes`', 'divergence'],
  ['class-identity-and-instanceof', '`instanceof` against a class the module exports', 'modelled'],
  ['enum-and-constant-values', 'enum members and module-level constants', 'modelled'],
  ['unimplemented-surface-classes', 'classes the module exports that the fakes do not implement', 'not modelled'],
  ['sibling-script-modules', 'the other `@minecraft/*` script modules — `@minecraft/server-ui` first', 'not modelled'],
]

describe('the README coverage table', () => {
  const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8')

  const rows = [...readme.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|\s*$/gm)]
    .map((match) => ({
      id: match[1].trim().replace(/^`|`$/g, ''),
      subject: match[2].trim(),
      coverage: match[3].trim(),
      description: match[4].trim(),
    }))
    .filter((row) => ['modelled', 'not modelled', 'divergence'].includes(row.coverage))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const documented = [...COVERAGE_ROWS, ...LIBRARY_RULINGS]
  const divergences = documented.filter(([, , coverage]) => coverage === 'divergence')

  it('carries a row for every behaviour the design ruled on', () => {
    expect(COVERAGE_ROWS.map(([id]) => id).filter((id) => !byId.has(id))).toEqual([])
    expect(COVERAGE_ROWS).toHaveLength(76)
  })

  it('carries a row for every divergence the library rules on alone', () => {
    expect(LIBRARY_RULINGS.map(([id]) => id).filter((id) => !byId.has(id))).toEqual([])
  })

  // The id is the row's identity and the prose columns are not, so this is an internal-consistency
  // check between two in-repo copies rather than a pin on the design's wording.
  it('keeps the row subjects in step between the README and the list it is checked against', () => {
    const wrong = documented
      .filter(([id, subject]) => byId.get(id)?.subject !== subject)
      .map(([id, subject]) => `${id}: expected ${subject}, read ${String(byId.get(id)?.subject)}`)
    expect(wrong).toEqual([])
  })

  it('gives every row the coverage the design ruled on', () => {
    const wrong = COVERAGE_ROWS.filter(([id, , coverage]) => byId.get(id)?.coverage !== coverage).map(
      ([id, , coverage]) => `${id}: expected ${coverage}, read ${String(byId.get(id)?.coverage)}`,
    )
    expect(wrong).toEqual([])
  })

  it("carries no row that is neither the design's nor a recorded library ruling", () => {
    const known = new Set(documented.map(([id]) => id))
    expect(rows.map((row) => row.id).filter((id) => !known.has(id))).toEqual([])
  })

  it('issues every id once', () => {
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })

  it('carries the difference itself on every divergence row', () => {
    const bare = divergences.map(([id]) => id).filter((id) => (byId.get(id)?.description.length ?? 0) < 40)
    expect(bare).toEqual([])
  })

  it('carries the twenty divergences the design named, and none the library rules alone', () => {
    expect(COVERAGE_ROWS.filter(([, , coverage]) => coverage === 'divergence')).toHaveLength(20)
    expect(LIBRARY_RULINGS).toHaveLength(0)
    expect(divergences).toHaveLength(20)
    expect(rows.filter((row) => row.coverage === 'divergence')).toHaveLength(20)
  })

  it('describes every divergence in a section of its own, named for its row', () => {
    const start = readme.search(/^## Divergences in detail$/m)
    expect(start).toBeGreaterThanOrEqual(0)
    const headings = new Set([...readme.slice(start).matchAll(/^### (.+)$/gm)].map((match) => match[1].trim()))
    const expected = divergences.map(([id, subject]) => `\`${id}\` — ${subject}`)
    expect(expected.filter((heading) => !headings.has(heading))).toEqual([])
    expect(headings.size).toBe(divergences.length)
  })
})

// ---------------------------------------------------------------------------
// Compile-time cases
// ---------------------------------------------------------------------------

type ModuleNamespace = typeof import('@minecraft/server')
type ServerShape = Pick<
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
  serverIsAssignable: (): ServerShape => createServer(),

  registriesAreClassStaticSides: (): typeof MC.BiomeTypes => createServer().BiomeTypes,

  objectLiteralIsNotARegistry: (): void => {
    // @ts-expect-error an object literal carries no `prototype`, which the static side declares
    const _registry: typeof MC.BiomeTypes = { get: () => undefined, getAll: () => [] }
    void _registry
  },

  serverCarriesNothingTheModuleLacks: (): void => {
    // @ts-expect-error the server's names mirror the module's exports
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

  presetTakesTheServer: (): void => {
    withVanillaDimensions(createServer())
    // @ts-expect-error a preset needs the world the server carries
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
