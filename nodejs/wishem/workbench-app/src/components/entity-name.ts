import type { ComponentTypeDefinition, Entity, Id } from '@thrashplay/wishem-core'

/** The labels of the component types of the entity, in the order of the definitions, or `No components`. */
export const entityName = (entity: Entity, definitions: readonly ComponentTypeDefinition[]): string => {
  const labels = definitions.filter((definition) => definition.id in entity.components).map(({ label }) => label)
  return labels.length === 0 ? 'No components' : labels.join(', ')
}

/** The first 10 characters of the ID. */
export const shortId = (id: Id): string => id.slice(0, 10)
