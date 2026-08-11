/**
 * The `EntityTypes` type catalog: the per-server class object `createServer` hands out, the
 * `registerEntityType` free function that fills it, and the lookup `EntityTypes.get` and
 * `Dimension.spawnEntity` both resolve through.
 *
 * The engine's catalog is read-only from script and refuses every read during early execution. The
 * fakes have no early phase, so a lookup answers whenever a test makes it, and registration is a
 * free function rather than a member `@minecraft/server` does not declare.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import { InvalidArgumentError } from './errors.js'
import { FakeEntityTypes } from './generated/index.js'
import { canonicalId } from './ids.js'
import { construct } from './runtime/construct.js'
import { initFake, registerBehaviour } from './runtime/member.js'
import { dataOf, serverOf, type ServerState } from './runtime/state.js'

/** The state behind a type catalog: the server whose entity types it answers from. */
export interface EntityTypesData {
  readonly server: ServerState
}

/**
 * The key an `EntityType` reports, derived from the identifier by the engine's one rule:
 * `entity.<id>.name` with a leading `minecraft:` stripped and any other namespace kept.
 */
export const localizationKeyFor = (id: string): string => `entity.${id.replace(/^minecraft:/, '')}.name`

/**
 * The engine's argument-type guard on a lookup, whose wording splits four ways. The split does not
 * follow `typeof`: an array and a function take the conversion wording, an object literal does not.
 * Only the six shapes above were measured; every other object takes the plain-object wording, which
 * is the library's own extrapolation rather than an observation.
 */
const assertIdentifier: (value: unknown) => asserts value is string = (value) => {
  if (typeof value === 'string') {
    return
  }
  if (value === undefined || value === null) {
    throw new InvalidArgumentError('Invalid type passed to argument [0]. Expected type: string')
  }
  const wording =
    value instanceof String ? 'Object has an invalid native handle.'
    : typeof value !== 'object' || Array.isArray(value) ? 'Native type conversion failed.'
    : 'Object did not have a native handle.'
  throw new TypeError(`${wording} Function argument [0] expected type: string`)
}

/** The entity types one server holds, in registration order. */
const catalogOf = (fake: object): Map<string, MC.EntityType> => dataOf<EntityTypesData>(fake).server.entityTypes

/**
 * The type registered under an identifier, or `undefined` where nothing registers it. A bare
 * identifier resolves as `minecraft:<id>` and nothing else — no other namespace is searched — and
 * the match is exact, so whitespace and case differences miss.
 */
export const lookupEntityType = (server: ServerState, identifier: string): MC.EntityType | undefined =>
  server.entityTypes.get(canonicalId(identifier))

/**
 * A type catalog bound to one server. Two servers in one process share nothing, so a test needs no
 * reset hook; the subclass is what carries the binding, since the catalog is reached as the class
 * itself rather than an instance.
 */
export const createEntityTypes = (server: ServerState): typeof MC.EntityTypes => {
  const catalog = class EntityTypes extends FakeEntityTypes {}
  initFake(catalog, {
    className: 'EntityTypes',
    own: {},
    valid: true,
    data: { server } satisfies EntityTypesData,
  })
  return catalog
}

/**
 * Registers an entity type with a server, and hands back the `EntityType` its catalog will answer
 * with. The identifier normalizes on entry and is stored and reported in the canonical prefixed
 * form; an omitted `localizationKey` derives from it by the engine's rule.
 *
 * Registering an identifier the server already holds throws rather than replacing the entry, which
 * would strand an `EntityType` a test is holding.
 *
 * @example
 * ```ts
 * const server = createServer()
 * const type = registerEntityType(server, 'mypack:guard')
 * server.EntityTypes.get('mypack:guard') === type   // true
 * ```
 */
export const registerEntityType = (server: ServerLike, id: string, localizationKey?: string): MC.EntityType => {
  const state = serverOf(server.world)
  const canonical = canonicalId(id)
  if (state.entityTypes.has(canonical)) {
    throw new InvalidArgumentError(
      `Invalid value passed to argument [1]. The entity type ${canonical} is already registered with this server.`,
    )
  }
  const type = construct('EntityType', {
    own: { id: canonical, localizationKey: localizationKey ?? localizationKeyFor(canonical) },
    data: { server: state },
  }) as MC.EntityType
  state.entityTypes.set(canonical, type)
  return type
}

registerBehaviour('EntityTypes', {
  get: (fake: object, identifier: unknown) => {
    assertIdentifier(identifier)
    return catalogOf(fake).get(canonicalId(identifier))
  },

  // A fresh array each call over the same entry objects, as the engine's is.
  getAll: (fake: object) => [...catalogOf(fake).values()],
})
