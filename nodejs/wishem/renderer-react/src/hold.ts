import type { Id, Model } from '@thrashplay/wishem-core'
import type { ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'

/** A reference that names an entity that is already on the path from the top level. */
export interface HoldCycle {
  sidecar: string
  /** The component type of the holder. */
  componentType: Id
  field: Id
  holder: Id
  entity: Id
}

export interface Holds {
  /** The entities that a reference field of a component with a view names, not counting a reference to itself. */
  held: ReadonlySet<Id>
  /** The references that close a cycle, found from the entities that are not held and then from the others. */
  cycles: HoldCycle[]
}

/** The held entities and the cycles of references, for a table of views and a model. */
export const findHolds = (views: ViewTable, model: Model): Holds => {
  const ids = new Set(model.entities.map(({ id }) => id))
  const edges = new Map<Id, HoldCycle[]>()
  const held = new Set<Id>()

  for (const { id: holder, components } of model.entities) {
    const own: HoldCycle[] = []
    for (const definition of model.definitions) {
      const view = views.get(definition.id)
      const component = components[definition.id] as (typeof components)[string] | undefined
      if (!view || !component) {
        continue
      }
      for (const { field } of propNames(definition).props) {
        const value = component[field.id]
        if (field.type === 'reference' && typeof value === 'string' && ids.has(value)) {
          own.push({ sidecar: view.sidecar, componentType: definition.id, field: field.id, holder, entity: value })
          if (value !== holder) {
            held.add(value)
          }
        }
      }
    }
    edges.set(holder, own)
  }

  const cycles: HoldCycle[] = []
  const visited = new Set<Id>()
  const path = new Set<Id>()
  const visit = (id: Id) => {
    visited.add(id)
    path.add(id)
    for (const edge of edges.get(id) ?? []) {
      if (path.has(edge.entity)) {
        cycles.push(edge)
      } else if (!visited.has(edge.entity)) {
        visit(edge.entity)
      }
    }
    path.delete(id)
  }
  for (const { id } of model.entities) {
    if (!held.has(id) && !visited.has(id)) {
      visit(id)
    }
  }
  for (const { id } of model.entities) {
    if (!visited.has(id)) {
      visit(id)
    }
  }

  return { held, cycles }
}
