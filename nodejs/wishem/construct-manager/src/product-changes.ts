import { isEqual, storeInputs } from '@thrashplay/wishem-core'
import type { Entity, Model } from '@thrashplay/wishem-core'
import type { Input } from '@thrashplay/wishem-hub'

const sameKeys = (a: object, b: object): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key))
}

/** True when only field values differ: same definitions, entity IDs and order, component types, and no removed field. */
const onlyValuesDiffer = (before: Model, after: Model): boolean =>
  isEqual({ definitions: before.definitions, entities: [] }, { definitions: after.definitions, entities: [] }) &&
  before.entities.length === after.entities.length &&
  after.entities.every((entity, index) => {
    const old = before.entities[index] as Entity | undefined
    return (
      old?.id === entity.id &&
      sameKeys(old.components, entity.components) &&
      Object.entries(old.components).every(([type, fields]) =>
        Object.keys(fields).every((field) => Object.hasOwn(entity.components[type] ?? {}, field)),
      )
    )
  })

/**
 * The inputs that change a product construct from the model `before` to the model `after`:
 * one `<storeId>/set-field` for each changed value when only values differ, else one `<storeId>/replace-model`.
 * An empty list when the models are equal. Default `storeId`: `store`.
 */
export const productChanges = (before: Model, after: Model, storeId = 'store'): Input[] => {
  if (isEqual(before, after)) {
    return []
  }
  const inputs = storeInputs(storeId)
  if (!onlyValuesDiffer(before, after)) {
    return [inputs.replaceModel(after)]
  }
  return after.entities.flatMap((entity, index) =>
    Object.entries(entity.components).flatMap(([componentType, fields]) =>
      Object.entries(fields).flatMap(([field, value]) =>
        before.entities[index]?.components[componentType]?.[field] === value ?
          []
        : [inputs.setField({ entity: entity.id, componentType, field, value })],
      ),
    ),
  )
}
