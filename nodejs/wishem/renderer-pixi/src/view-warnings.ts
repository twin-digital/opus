import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import { propNames } from './field-names.js'
import type { ViewTable } from './types.js'

export interface ViewWarning {
  kind: 'empty-name'
  sidecar: string
  componentType: Id
  fields: [Id]
}

const compare = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0

/** Sorted by sidecar and component type, then in the order of the fields. */
export const viewWarnings = (views: ViewTable, definitions: readonly ComponentTypeDefinition[]): ViewWarning[] => {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const warnings: ViewWarning[] = []

  for (const { sidecar, componentType } of views.values()) {
    const definition = definitionsById.get(componentType)
    if (!definition) {
      continue
    }
    for (const problem of propNames(definition).problems) {
      if (problem.kind === 'empty-name') {
        warnings.push({ kind: 'empty-name', sidecar, componentType, fields: [problem.field] })
      }
    }
  }

  return warnings.sort((a, b) => compare(a.sidecar, b.sidecar) || compare(a.componentType, b.componentType))
}

/** One line for the browser console. */
export const describeWarning = ({ sidecar, componentType, fields }: ViewWarning): string =>
  `wishem: the sidecar ${sidecar}: the label of the field ${fields[0]} of the component type ${componentType} gives an empty name. The view does not get the field.`
