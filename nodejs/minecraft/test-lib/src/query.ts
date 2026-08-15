/**
 * `EntityQueryOptions` matching, shared by the world and dimension lookups and by `entity.matches`
 * — one mechanism reached two ways.
 *
 * Eight of the twenty-four fields filter: `type`, `tags`, `name` and `families`, and the exclusions
 * `excludeTypes`, `excludeTags`, `excludeNames` and `excludeFamilies`. Each of the other sixteen
 * throws `NotImplementedError` naming the field it could not honour, so a test learns which filter
 * was dropped instead of reading a result that quietly ignored it.
 */

import type * as MC from '@minecraft/server'

import { typeFamiliesOf } from './components.js'
import { NotImplementedError } from './errors.js'
import { canonicalId } from './ids.js'

/** The `EntityFilter`/`EntityQueryOptions` fields this cycle honours. */
export const HONOURED_QUERY_FIELDS = [
  'type',
  'tags',
  'name',
  'families',
  'excludeTypes',
  'excludeTags',
  'excludeNames',
  'excludeFamilies',
] as const

/**
 * The sixteen fields this cycle drops, scanned in this order so that a query naming several names
 * the same one every time: `EntityQueryOptions`' own positional fields, then the game-mode, level,
 * rotation, property and score fields it inherits from `EntityFilter`.
 */
const UNHONOURED_QUERY_FIELDS = [
  'closest',
  'farthest',
  'location',
  'maxDistance',
  'minDistance',
  'volume',
  'gameMode',
  'excludeGameModes',
  'minLevel',
  'maxLevel',
  'minHorizontalRotation',
  'maxHorizontalRotation',
  'minVerticalRotation',
  'maxVerticalRotation',
  'propertyOptions',
  'scoreOptions',
] as const satisfies readonly (keyof MC.EntityQueryOptions)[]

/**
 * Throws for the first field a query names that this cycle does not honour. A lookup calls this
 * once, ahead of the entities, so a query that matched nothing still reports the filter it dropped.
 */
export const assertQueryHonoured = (options: MC.EntityQueryOptions | undefined): void => {
  if (options === undefined) {
    return
  }
  for (const field of UNHONOURED_QUERY_FIELDS) {
    if (options[field] !== undefined) {
      throw new NotImplementedError(`EntityQueryOptions.${field}`)
    }
  }
}

/**
 * Whether an entity matches a query. `type` matches `typeId` and `name` matches `nameTag`; `tags`
 * and `families` each keep an entity carrying every token listed, while `excludeTags` and
 * `excludeFamilies` drop one carrying any; each `exclude` field removes what its counterpart would
 * have kept, and fields given together intersect. A field outside the honoured eight throws
 * `NotImplementedError` naming itself.
 *
 * The filter reads the members the fake already exposes, so a `name` query against an entity whose
 * `nameTag` was never supplied throws `UnsetValueError` exactly as a direct read of it would, and a
 * query naming none of them reads nothing.
 */
export const matchesQuery = (entity: MC.Entity, options: MC.EntityQueryOptions | undefined): boolean => {
  assertQueryHonoured(options)
  if (options === undefined) {
    return true
  }

  // A type id normalizes on entry, as it does everywhere the library stores one; nameTag and the
  // tag set are free strings the test supplied, so they compare verbatim.
  if (options.type !== undefined && entity.typeId !== canonicalId(options.type)) {
    return false
  }
  if (options.excludeTypes?.some((type) => canonicalId(type) === entity.typeId) === true) {
    return false
  }
  if (options.name !== undefined && entity.nameTag !== options.name) {
    return false
  }
  if (options.excludeNames?.includes(entity.nameTag) === true) {
    return false
  }
  if (options.tags?.every((tag) => entity.hasTag(tag)) === false) {
    return false
  }
  if (options.excludeTags?.some((tag) => entity.hasTag(tag)) === true) {
    return false
  }
  // A family is not an identifier and takes no prefix, so a token compares verbatim. An entity
  // carrying no type-family component has no tokens, which no `families` token can match.
  if (options.families !== undefined || options.excludeFamilies !== undefined) {
    const families = typeFamiliesOf(entity)
    if (options.families?.every((family) => families.includes(family)) === false) {
      return false
    }
    if (options.excludeFamilies?.some((family) => families.includes(family)) === true) {
      return false
    }
  }
  return true
}
