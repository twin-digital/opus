import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import type { ViewTable } from './collect-views.js'

export interface ViewDifference {
  kind: 'component-type-not-defined' | 'field-not-defined' | 'field-type-different'
  file: string
  componentType: Id
  /** Set for the two kinds that are about a field. */
  field?: Id
  /** The name of the prop in code. Set with `field`. */
  prop?: string
}

const compare = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0

const compareDifferences = (a: ViewDifference, b: ViewDifference): number =>
  compare(a.file, b.file) ||
  compare(a.componentType, b.componentType) ||
  compare(a.field ?? '', b.field ?? '') ||
  compare(a.kind, b.kind)

/** Compares each view with the definitions. The result is sorted by file, component type, and field. */
export const checkViews = (views: ViewTable, definitions: readonly ComponentTypeDefinition[]): ViewDifference[] => {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const differences: ViewDifference[] = []

  for (const { file, view } of views.values()) {
    const definition = definitionsById.get(view.componentType)
    if (!definition) {
      differences.push({ kind: 'component-type-not-defined', file, componentType: view.componentType })
      continue
    }

    for (const [prop, declaration] of Object.entries(view.props)) {
      const field = definition.fields.find((candidate) => candidate.id === declaration.field)
      const base = { file, componentType: view.componentType, field: declaration.field, prop }
      if (!field) {
        differences.push({ kind: 'field-not-defined', ...base })
      } else if ((field.type as string) !== (declaration.type as string)) {
        differences.push({ kind: 'field-type-different', ...base })
      }
    }
  }

  return differences.sort(compareDifferences)
}

/** One line for the browser console. */
export const describeDifference = (difference: ViewDifference): string => {
  const { kind, file, componentType, field, prop } = difference
  switch (kind) {
    case 'component-type-not-defined':
      return `wishem: the view ${file} declares the component type ${componentType}, which no definition has. No view is drawn for it.`
    case 'field-not-defined':
      return `wishem: the view ${file} declares the field ${field ?? ''} (prop "${prop ?? ''}"), which the component type ${componentType} does not have. The prop has no value.`
    case 'field-type-different':
      return `wishem: the view ${file} declares the field ${field ?? ''} (prop "${prop ?? ''}") with a type that the component type ${componentType} does not give to it.`
  }
}
