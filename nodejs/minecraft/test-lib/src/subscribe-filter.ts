/**
 * The options argument to `subscribe`, and what it filters.
 *
 * Five of the signals the fakes raise declare an options type: the `entityRemove`,
 * `entityHurt`, `entityHealthChanged` and `entityDie` after-events, and the `entityHurt`
 * before-event. On those, every field the declared type carries is honoured — `entities` as an
 * instance filter, `entityTypes` against the subject entity's prefixed `typeId`,
 * `allowedDamageCauses` against the cause the action reports, and `entityFilter` through the same
 * six-field matcher an entity lookup runs — and fields given together intersect, as the engine was
 * observed to (`f:subscribe-filter-fields-intersect`).
 *
 * `entityTypes` matches the prefixed form only: the engine matches a bare id against nothing at all
 * (`f:subscribe-filter-entity-types-requires-the-prefix`), so the fake does not normalize it either.
 *
 * Anything else — a field a signal's options type does not carry, or any options argument at all on
 * a signal the fakes never raise — throws `NotImplementedError` naming the field, at the `subscribe`
 * call. A test learns there that its filter cannot be honoured, rather than watching a handler go
 * quiet at a dispatch that never comes.
 */

import type * as MC from '@minecraft/server'

import { NotImplementedError } from './errors.js'
import { assertQueryHonoured, matchesQuery } from './query.js'
import type { SignalScope } from './runtime/state.js'

/** Which fields one signal's declared options type carries, and how a payload yields its subject. */
interface FilterableSignal {
  readonly fields: readonly ('entities' | 'entityTypes' | 'allowedDamageCauses' | 'entityFilter')[]
  /** The entity the event is about — the hurt entity, the dead entity — or `undefined` where the
   *  payload carries none and identity has to come from `subject` instead. */
  readonly entityOf?: (payload: never) => MC.Entity | undefined
  /** Identity for a payload with no entity object: `entityRemove` carries an id and a typeId. */
  readonly identityOf?: (payload: never) => { id: string; typeId: string }
  readonly causeOf?: (payload: never) => MC.EntityDamageCause
}

interface HurtPayload {
  readonly hurtEntity: MC.Entity
  readonly damageSource: MC.EntityDamageSource
}

/**
 * The signals an options argument may filter, keyed as the signal store keys them. A signal absent
 * from this table takes no options at all — either the declarations give it none, or the fakes
 * raise nothing for it to filter.
 */
const FILTERABLE: Readonly<Record<string, FilterableSignal | undefined>> = {
  'world.afterEvents.entityHurt': {
    fields: ['entities', 'entityTypes', 'entityFilter', 'allowedDamageCauses'],
    entityOf: (payload: HurtPayload) => payload.hurtEntity,
    causeOf: (payload: HurtPayload) => payload.damageSource.cause,
  },
  'world.beforeEvents.entityHurt': {
    // The declared before-event options carry neither `entities` nor `entityTypes`.
    fields: ['entityFilter', 'allowedDamageCauses'],
    entityOf: (payload: HurtPayload) => payload.hurtEntity,
    causeOf: (payload: HurtPayload) => payload.damageSource.cause,
  },
  'world.afterEvents.entityDie': {
    fields: ['entities', 'entityTypes'],
    entityOf: (payload: { deadEntity: MC.Entity }) => payload.deadEntity,
  },
  'world.afterEvents.entityHealthChanged': {
    fields: ['entities', 'entityTypes'],
    entityOf: (payload: { entity: MC.Entity }) => payload.entity,
  },
  'world.afterEvents.entityRemove': {
    // The payload carries no entity — the entity is gone by the time it is delivered — so the
    // instance filter matches on the id it reports.
    fields: ['entities', 'entityTypes'],
    identityOf: (payload: { removedEntityId: string; typeId: string }) => ({
      id: payload.removedEntityId,
      typeId: payload.typeId,
    }),
  },
} as const

/** How the signal store keys a signal, matching `events.ts`. */
const keyOf = (scope: SignalScope, name: string): string => `${scope}.${name}`

/**
 * Refuses a filter the fake cannot honour, at the subscribe call. Every field the caller named is
 * checked, in the order the options object carries them, so a call naming several is refused on the
 * first — and a signal outside the filterable table is refused whatever the field was.
 */
export const assertFilterHonoured = (className: string, scope: SignalScope, name: string, options: unknown): void => {
  if (options === undefined) {
    return
  }
  const filterable = FILTERABLE[keyOf(scope, name)]
  for (const field of Object.keys(options as Record<string, unknown>)) {
    if ((options as Record<string, unknown>)[field] === undefined) {
      continue
    }
    if (!filterable?.fields.some((honoured) => honoured === field)) {
      throw new NotImplementedError(`${className}.subscribe options.${field}`)
    }
  }
  // The entity filter runs the lookup matcher, whose own unhonoured fields are refused here too
  // rather than at the dispatch that would have consulted them.
  const entityFilter = (options as { entityFilter?: MC.EntityFilter }).entityFilter
  if (entityFilter !== undefined) {
    assertQueryHonoured(entityFilter)
  }
}

/**
 * Whether one subscriber's options admit one payload. Fields given together intersect; a signal
 * with no options subscribed against delivers everything.
 */
export const admits = (scope: SignalScope, name: string, options: unknown, payload: unknown): boolean => {
  if (options === undefined) {
    return true
  }
  const filterable = FILTERABLE[keyOf(scope, name)]
  if (!filterable) {
    // Unreachable: subscribe refused this options argument. Deliver rather than drop silently.
    return true
  }

  const { entities, entityTypes, allowedDamageCauses, entityFilter } = options as {
    entities?: MC.Entity[]
    entityTypes?: string[]
    allowedDamageCauses?: MC.EntityDamageCause[]
    entityFilter?: MC.EntityFilter
  }

  const subject = filterable.entityOf?.(payload as never)
  const identity = filterable.identityOf?.(payload as never) ?? {
    id: subject?.id ?? '',
    typeId: subject?.typeId ?? '',
  }

  if (entities !== undefined && !entities.some((candidate) => candidate.id === identity.id)) {
    return false
  }
  // The prefixed form only: a bare id matches nothing, as the engine matches nothing for one.
  if (entityTypes !== undefined && !entityTypes.includes(identity.typeId)) {
    return false
  }
  if (allowedDamageCauses !== undefined) {
    const cause = filterable.causeOf?.(payload as never)
    if (cause === undefined || !allowedDamageCauses.includes(cause)) {
      return false
    }
  }
  if (entityFilter !== undefined) {
    if (subject === undefined || !matchesQuery(subject, entityFilter)) {
      return false
    }
  }
  return true
}
