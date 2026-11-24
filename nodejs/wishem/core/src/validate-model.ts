import type { ComponentTypeDefinition, Entity, FieldDefinition, Id, Model, Problem, ValidationResult } from './model.js'

type Path = (string | number)[]

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const describeValue = (value: unknown): string => (typeof value === 'string' ? `"${value}"` : JSON.stringify(value))

/** Validates data of an unknown shape against the rules of the `wishem/core/model` specification. */
export const validateModel = (data: unknown): ValidationResult => {
  const problems: Problem[] = []
  const warnings: Problem[] = []

  const error = (path: Path, message: string): void => {
    problems.push({ severity: 'error', message, path })
  }

  /** Reports an ID that does not have the prefix of its kind or a lowercase UUID. */
  const checkId = (value: unknown, prefix: string, thing: string, path: Path): value is Id => {
    if (typeof value !== 'string') {
      error(path, `${thing} has an ID that is not a string`)
      return false
    }
    if (new RegExp(`^${prefix}_${UUID}$`).test(value)) {
      return true
    }
    const otherPrefix = /^([a-z]+)_/.exec(value)?.[1]
    if (otherPrefix !== undefined && otherPrefix !== prefix && ['ct', 'fld', 'e'].includes(otherPrefix)) {
      error(
        path,
        `${thing} has the ID "${value}" with the prefix "${otherPrefix}_", but the prefix "${prefix}_" is necessary`,
      )
    } else {
      error(path, `${thing} has the ID "${value}", which is not "${prefix}_" and a UUID in lowercase`)
    }
    return false
  }

  const checkLabel = (value: unknown, thing: string, path: Path): value is string => {
    if (typeof value === 'string' && value.length > 0) {
      return true
    }
    error(path, `${thing} has a label that is not a string with one character or more`)
    return false
  }

  if (!isRecord(data)) {
    error([], 'The model is not an object')
    return { ok: false, problems }
  }

  const rawDefinitions = data.definitions
  const rawEntities = data.entities
  if (!Array.isArray(rawDefinitions)) {
    error(['definitions'], 'The model has no `definitions` list')
  }
  if (!Array.isArray(rawEntities)) {
    error(['entities'], 'The model has no `entities` list')
  }
  if (!Array.isArray(rawDefinitions) || !Array.isArray(rawEntities)) {
    return { ok: false, problems }
  }

  const definitions: ComponentTypeDefinition[] = []
  const typesById = new Map<Id, ComponentTypeDefinition>()
  const typeIdsByLabel = new Map<string, Id[]>()

  rawDefinitions.forEach((raw: unknown, index) => {
    const path: Path = ['definitions', index]
    if (!isRecord(raw)) {
      error(path, `Definition ${index} is not an object`)
      return
    }
    const label = typeof raw.label === 'string' ? raw.label : ''
    const thing = label === '' ? `Component type ${index}` : `Component type "${label}"`
    const idOk = checkId(raw.id, 'ct', thing, [...path, 'id'])
    const labelOk = checkLabel(raw.label, thing, [...path, 'label'])
    if (idOk && typesById.has(raw.id as Id)) {
      error([...path, 'id'], `${thing} has the ID "${raw.id as string}", which another component type has`)
    }

    const fields: FieldDefinition[] = []
    const fieldIds = new Set<Id>()
    if (!Array.isArray(raw.fields)) {
      error([...path, 'fields'], `${thing} has no \`fields\` list`)
    } else {
      raw.fields.forEach((rawField: unknown, fieldIndex) => {
        const fieldPath: Path = [...path, 'fields', fieldIndex]
        if (!isRecord(rawField)) {
          error(fieldPath, `Field ${fieldIndex} of ${thing} is not an object`)
          return
        }
        const fieldName =
          typeof rawField.label === 'string' && rawField.label !== '' ? `"${rawField.label}"`
          : typeof rawField.id === 'string' ? rawField.id
          : String(fieldIndex)
        const fieldThing = `Field ${fieldName} of ${thing}`
        const fieldIdOk = checkId(rawField.id, 'fld', fieldThing, [...fieldPath, 'id'])
        const fieldLabelOk = checkLabel(rawField.label, fieldThing, [...fieldPath, 'label'])
        if (fieldIdOk) {
          if (fieldIds.has(rawField.id as Id)) {
            error(
              [...fieldPath, 'id'],
              `${fieldThing} has the ID "${rawField.id as string}", which another field of the component type has`,
            )
          }
          fieldIds.add(rawField.id as Id)
        }
        const typeOk = rawField.type === 'string'
        if (!typeOk) {
          error(
            [...fieldPath, 'type'],
            `${fieldThing} has the type ${describeValue(rawField.type)}, but the only type is "string"`,
          )
        }
        if (fieldIdOk && fieldLabelOk && typeOk) {
          fields.push({ id: rawField.id as Id, label: rawField.label as string, type: 'string' })
        }
      })
    }

    if (idOk && labelOk) {
      const id = raw.id as Id
      const type: ComponentTypeDefinition = { id, label: raw.label as string, fields }
      definitions.push(type)
      if (!typesById.has(id)) {
        typesById.set(id, type)
      }
      typeIdsByLabel.set(type.label, [...(typeIdsByLabel.get(type.label) ?? []), id])
    }
  })

  const entities: Entity[] = []
  const entityIds = new Set<Id>()

  rawEntities.forEach((raw: unknown, index) => {
    const path: Path = ['entities', index]
    if (!isRecord(raw)) {
      error(path, `Entity ${index} is not an object`)
      return
    }
    const thing = typeof raw.id === 'string' ? `Entity ${raw.id}` : `Entity ${index}`
    const idOk = checkId(raw.id, 'e', thing, [...path, 'id'])
    if (idOk) {
      if (entityIds.has(raw.id as Id)) {
        error([...path, 'id'], `${thing} has an ID that another entity has`)
      }
      entityIds.add(raw.id as Id)
    }
    if (!isRecord(raw.components)) {
      error([...path, 'components'], `${thing} has no \`components\` record`)
      return
    }

    const components: Entity['components'] = {}
    for (const [typeId, rawComponent] of Object.entries(raw.components)) {
      const componentPath: Path = [...path, 'components', typeId]
      const type = typesById.get(typeId)
      if (type === undefined) {
        error(componentPath, `${thing} has a component of the type ${typeId}, which is not defined`)
        continue
      }
      if (!isRecord(rawComponent)) {
        error(componentPath, `${thing} has a component of the type "${type.label}" that is not an object`)
        continue
      }
      const component: Record<Id, string> = {}
      for (const [fieldId, value] of Object.entries(rawComponent)) {
        const field = type.fields.find((f) => f.id === fieldId)
        if (field === undefined) {
          error(
            [...componentPath, fieldId],
            `${thing} has a component of the type "${type.label}" with the key ${fieldId}, which is not a field of the type`,
          )
        } else if (typeof value !== 'string') {
          error(
            [...componentPath, fieldId],
            `${thing} has the value ${describeValue(value)} for the field "${field.label}" of "${type.label}", but the type of the field is "string"`,
          )
        } else {
          component[fieldId] = value
        }
      }
      components[typeId] = component
    }
    if (idOk) {
      entities.push({ id: raw.id as Id, components })
    }
  })

  if (problems.length > 0) {
    return { ok: false, problems }
  }

  for (const [label, ids] of typeIdsByLabel) {
    const [first, ...rest] = ids
    for (const other of rest) {
      warnings.push({
        severity: 'warning',
        message: `Component types ${first} and ${other} have the same label "${label}"`,
        path: ['definitions'],
      })
    }
  }

  const model: Model = { definitions, entities }
  return { ok: true, model, warnings }
}
