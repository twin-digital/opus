import type { ComponentTypeDefinition, Id } from '@thrashplay/wishem-core'
import type { ViewTable } from './collect-views.js'
import { propNames } from './field-names.js'

export interface ViewWarning {
  kind: 'component-type-not-defined' | 'same-name'
  sidecar: string
  componentType: Id
  /** Set for `same-name`. */
  fields?: [Id, Id]
  /** Set for `same-name`. */
  name?: string
}

const compare = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0

const compareWarnings = (a: ViewWarning, b: ViewWarning): number =>
  compare(a.sidecar, b.sidecar) ||
  compare(a.componentType, b.componentType) ||
  compare(a.name ?? '', b.name ?? '') ||
  compare(a.kind, b.kind)

/** The result is sorted by sidecar, component type, and name. */
export const viewWarnings = (views: ViewTable, definitions: readonly ComponentTypeDefinition[]): ViewWarning[] => {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const warnings: ViewWarning[] = []

  for (const { sidecar, componentType } of views.values()) {
    const definition = definitionsById.get(componentType)
    if (!definition) {
      warnings.push({ kind: 'component-type-not-defined', sidecar, componentType })
      continue
    }
    for (const problem of propNames(definition).problems) {
      if (problem.kind === 'same-name') {
        warnings.push({ kind: 'same-name', sidecar, componentType, name: problem.name, fields: problem.fields })
      }
    }
  }

  return warnings.sort(compareWarnings)
}

/** One line for the browser console. */
export const describeWarning = (warning: ViewWarning): string => {
  const { kind, sidecar, componentType, fields, name } = warning
  switch (kind) {
    case 'component-type-not-defined':
      return `wishem: the sidecar ${sidecar} names the component type ${componentType}, which no definition has. No view is drawn for it.`
    case 'same-name':
      return `wishem: the sidecar ${sidecar}: the fields ${fields?.[0] ?? ''} and ${fields?.[1] ?? ''} of the component type ${componentType} give the same name "${name ?? ''}". The prop has the value of the first field.`
  }
}
