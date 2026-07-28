/**
 * `EntityQueryOptions` matching, shared by the world and dimension lookups and by `entity.matches`
 * — one mechanism reached two ways.
 *
 * Six of the twenty-four fields filter: `type`, `tags` and `name`, and the exclusions
 * `excludeTypes`, `excludeTags` and `excludeNames`. Each of the other eighteen throws
 * `NotImplementedError` naming the field it could not honour, so a test learns which filter was
 * dropped instead of reading a result that quietly ignored it.
 *
 * The matcher belongs to entity-model; the world and dimension lookups in `world.ts` import it
 * rather than filtering themselves, so both routes run one mechanism.
 */

import type * as MC from '@minecraft/server'

/** The `EntityFilter`/`EntityQueryOptions` fields this cycle honours. */
export const HONOURED_QUERY_FIELDS = ['type', 'tags', 'name', 'excludeTypes', 'excludeTags', 'excludeNames'] as const

/**
 * Whether an entity matches a query. `type` matches `typeId` and `name` matches `nameTag`; `tags`
 * keeps an entity carrying every tag listed and `excludeTags` drops one carrying any; each
 * `exclude` field removes what its counterpart would have kept, and fields given together
 * intersect. A field outside the honoured six throws `NotImplementedError` naming itself.
 *
 * The filter reads the members the fake already exposes, so a `name` query against an entity whose
 * `nameTag` was never supplied throws `UnsetValueError` exactly as a direct read of it would.
 */
export const matchesQuery = (_entity: MC.Entity, _options: MC.EntityQueryOptions | undefined): boolean => {
  throw new Error('query matching is not built yet')
}
