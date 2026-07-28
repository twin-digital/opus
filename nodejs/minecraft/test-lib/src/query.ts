/**
 * `EntityQueryOptions` matching, shared by the world and dimension lookups and by `entity.matches`
 * — one mechanism reached two ways.
 *
 * Six of the twenty-four fields filter: `type`, `tags` and `name`, and the exclusions
 * `excludeTypes`, `excludeTags` and `excludeNames`. Each of the other eighteen throws
 * `NotImplementedError` naming the field it could not honour, so a test learns which filter was
 * dropped instead of reading a result that quietly ignored it.
 */

import type * as MC from '@minecraft/server'

import { NotImplementedError } from './errors.js'

/** The `EntityFilter`/`EntityQueryOptions` fields this cycle honours. */
export const HONOURED_QUERY_FIELDS = ['type', 'tags', 'name', 'excludeTypes', 'excludeTags', 'excludeNames'] as const

/**
 * The eighteen fields this cycle drops, scanned in this order so that a query naming several names
 * the same one every time: `EntityQueryOptions`' own positional fields, then the families,
 * game-mode, level, rotation, property and score fields it inherits from `EntityFilter`.
 */
const UNHONOURED_QUERY_FIELDS = [
  'closest',
  'farthest',
  'location',
  'maxDistance',
  'minDistance',
  'volume',
  'families',
  'excludeFamilies',
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
 * keeps an entity carrying every tag listed and `excludeTags` drops one carrying any; each
 * `exclude` field removes what its counterpart would have kept, and fields given together
 * intersect. A field outside the honoured six throws `NotImplementedError` naming itself.
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

  if (options.type !== undefined && entity.typeId !== options.type) {
    return false
  }
  if (options.excludeTypes?.includes(entity.typeId) === true) {
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
  return true
}
