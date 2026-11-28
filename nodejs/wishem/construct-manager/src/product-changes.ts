import { isEqual, storeInputs } from '@thrashplay/wishem-core'
import type { Entity, Model } from '@thrashplay/wishem-core'
import type { Input } from '@thrashplay/wishem-hub'

const sameKeys = (a: object, b: object): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key))
}

/** True when only field values differ: same definitions, entity IDs and order, and component types. */
const onlyValuesDiffer = (before: Model, after: Model): boolean =>
  isEqual({ definitions: before.definitions, entities: [] }, { definitions: after.definitions, entities: [] }) &&
  before.entities.length === after.entities.length &&
  after.entities.every((entity, index) => {
    const old = before.entities[index] as Entity | undefined
    return old?.id === entity.id && sameKeys(old.components, entity.components)
  })

/**
 * The inputs that change a product construct from the model `before` to the model `after`.
 * When only values differ: one `<storeId>/set-field` for each changed value, then one `<storeId>/clear-field`
 * for each removed value, for each component in order. Else one `<storeId>/replace-model`.
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
    Object.entries(entity.components).flatMap(([componentType, fields]) => {
      const old = before.entities[index]?.components[componentType] ?? {}
      return [
        ...Object.entries(fields).flatMap(([field, value]) =>
          old[field] === value ? [] : [inputs.setField({ entity: entity.id, componentType, field, value })],
        ),
        ...Object.keys(old)
          .filter((field) => !Object.hasOwn(fields, field))
          .map((field) => inputs.clearField({ entity: entity.id, componentType, field })),
      ]
    }),
  )
}
