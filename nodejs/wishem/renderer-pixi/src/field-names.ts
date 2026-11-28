import type { ComponentTypeDefinition, FieldDefinition, Id } from '@thrashplay/wishem-core'

/** The name of a prop for the label of a field. Can be empty or start with a digit. */
export const fieldName = (label: string): string =>
  label
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word, index) => (index === 0 ? word[0].toLowerCase() : word[0].toUpperCase()) + word.slice(1))
    .join('')

export type NameProblem =
  | { kind: 'empty-name'; field: Id }
  | { kind: 'name-starts-with-digit'; field: Id; name: string }
  | { kind: 'same-name'; name: string; fields: [Id, Id] }

export interface PropNames {
  /** One entry for each name, in the order of the definition. For two fields with one name, the first field. A field with an empty name has no entry. */
  props: { name: string; field: FieldDefinition }[]
  problems: NameProblem[]
}

export const propNames = (definition: ComponentTypeDefinition): PropNames => {
  const props: PropNames['props'] = []
  const problems: NameProblem[] = []
  const first = new Map<string, FieldDefinition>()

  for (const field of definition.fields) {
    const name = fieldName(field.label)
    if (name === '') {
      problems.push({ kind: 'empty-name', field: field.id })
      continue
    }
    if (/^[0-9]/.test(name)) {
      problems.push({ kind: 'name-starts-with-digit', field: field.id, name })
    }
    const earlier = first.get(name)
    if (earlier) {
      problems.push({ kind: 'same-name', name, fields: [earlier.id, field.id] })
      continue
    }
    first.set(name, field)
    props.push({ name, field })
  }

  return { props, problems }
}
