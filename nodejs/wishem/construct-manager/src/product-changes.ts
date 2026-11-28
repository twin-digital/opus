import { isEqual, storeInputs } from '@thrashplay/wishem-core'
import type { Entity, Model } from '@thrashplay/wishem-core'
import type { Input } from '@thrashplay/wishem-hub'

const sameKeys = (a: object, b: object): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key))
}

/** True when the entities that both models hold are in the same order and have the same component types. */
const commonEntitiesMatch = (before: Model, after: Model): boolean => {
  const beforeIds = new Set(before.entities.map((entity) => entity.id))
  const afterIds = new Set(after.entities.map((entity) => entity.id))
  const kept = before.entities.filter((entity) => afterIds.has(entity.id))
  const next = after.entities.filter((entity) => beforeIds.has(entity.id))
  return kept.every((entity, index) => {
    const other = next[index] as Entity | undefined
    return entity.id === other?.id && sameKeys(entity.components, other.components)
  })
}

/** True when the part inputs cannot make the change. */
const needsReplace = (before: Model, after: Model): boolean =>
  !isEqual({ definitions: before.definitions, entities: [] }, { definitions: after.definitions, entities: [] }) ||
  !commonEntitiesMatch(before, after)

/** The IDs of the entities that a value names, by the type of its field. */
const namedBy = (model: Model, componentType: string, field: string, value: unknown): string[] => {
  const type = model.definitions
    .find((definition) => definition.id === componentType)
    ?.fields.find((candidate) => candidate.id === field)?.type
  if (type === 'reference' && typeof value === 'string') {
    return [value]
  }
  if (type === 'reference-list' && Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * The inputs that change a product construct from the model `before` to the model `after`.
 * When the definitions, the order of the common entities, and their component types are equal, the inputs are
 * in three phases: one `<storeId>/add-entity` for each added entity (with an `index` unless it goes last), then
 * the `<storeId>/set-field` and `<storeId>/clear-field` inputs of the values, then `<storeId>/clear-field` for the
 * references between removed entities and one `<storeId>/remove-entity` for each removed entity.
 * A reference or a list that names an entity that a later input adds waits for a `set-field`.
 * Else one `<storeId>/replace-model`. An empty list when the models are equal. Default `storeId`: `store`.
 */
export const productChanges = (before: Model, after: Model, storeId = 'store'): Input[] => {
  if (isEqual(before, after)) {
    return []
  }
  const inputs = storeInputs(storeId)
  if (needsReplace(before, after)) {
    return [inputs.replaceModel(after)]
  }
  const beforeById = new Map(before.entities.map((entity) => [entity.id, entity]))
  const afterIds = new Set(after.entities.map((entity) => entity.id))
  const stored = before.entities.map((entity) => entity.id)
  const later: Input[] = []

  const additions: Input[] = []
  for (const [at, entity] of after.entities.entries()) {
    if (beforeById.has(entity.id)) {
      continue
    }
    const previous = after.entities[at - 1] as Entity | undefined
    const position = previous ? stored.indexOf(previous.id) + 1 : 0
    const end = position === stored.length
    stored.splice(position, 0, entity.id)
    const components: Entity['components'] = {}
    for (const [componentType, fields] of Object.entries(entity.components)) {
      const kept: Entity['components'][string] = {}
      components[componentType] = kept
      for (const [field, value] of Object.entries(fields)) {
        if (namedBy(after, componentType, field, value).every((id) => stored.includes(id))) {
          kept[field] = value
        } else {
          later.push(inputs.setField({ entity: entity.id, componentType, field, value }))
        }
      }
    }
    additions.push(inputs.addEntity({ id: entity.id, components }, end ? undefined : position))
  }

  const values = after.entities.flatMap((entity) => {
    const old = beforeById.get(entity.id)
    if (!old) {
      return []
    }
    return Object.entries(entity.components).flatMap(([componentType, fields]) => {
      const oldFields = old.components[componentType] ?? {}
      return [
        ...Object.entries(fields).flatMap(([field, value]) =>
          Object.hasOwn(oldFields, field) && isEqual(oldFields[field], value) ?
            []
          : [inputs.setField({ entity: entity.id, componentType, field, value })],
        ),
        ...Object.keys(oldFields)
          .filter((field) => !Object.hasOwn(fields, field))
          .map((field) => inputs.clearField({ entity: entity.id, componentType, field })),
      ]
    })
  })

  const removed = before.entities.filter((entity) => !afterIds.has(entity.id))
  const removedIds = new Set(removed.map((entity) => entity.id))
  const clears = removed.flatMap((entity) =>
    Object.entries(entity.components).flatMap(([componentType, fields]) =>
      Object.entries(fields)
        .filter(([field, value]) =>
          namedBy(before, componentType, field, value).some((id) => id !== entity.id && removedIds.has(id)),
        )
        .map(([field]) => inputs.clearField({ entity: entity.id, componentType, field })),
    ),
  )

  return [...additions, ...values, ...later, ...clears, ...removed.map((entity) => inputs.removeEntity(entity.id))]
}
