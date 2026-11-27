import { InputRefusedError } from '@thrashplay/wishem-hub'
import type { InputProblem, Input, ModelSubsystem, RecordedInput } from '@thrashplay/wishem-hub'
import { ModelError } from './core.js'
import { deepFreeze, isEqual } from './equality.js'
import type { Entity, FieldValue, Id, Model, Problem } from './model.js'
import { validateModel } from './validate-model.js'

export interface StoreOptions {
  /** Default `store`. */
  id?: string
  /** The first model. Default: a model with no definitions and no entities. */
  model?: unknown
}

export interface ReplaceModelPayload {
  model: Model
}

export interface AddEntityPayload {
  entity: Entity
}

export interface RemoveEntityPayload {
  /** The ID of the entity. */
  entity: Id
}

export interface SetFieldPayload {
  /** The ID of the entity. */
  entity: Id
  /** The ID of the component type. */
  componentType: Id
  /** The ID of the field. */
  field: Id
  value: FieldValue
}

export interface StoreInputs {
  replaceModel(model: Model): Input
  addEntity(entity: Entity): Input
  removeEntity(entity: Id): Input
  setField(payload: SetFieldPayload): Input
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const refuse = (message: string, path: (string | number)[]): never => {
  throw new InputRefusedError([{ message, path }])
}

const toInputProblems = (problems: Problem[]): InputProblem[] =>
  problems.filter((problem) => problem.severity === 'error').map(({ message, path }) => ({ message, path }))

const replaceModel = (part: Model, payload: unknown): Model => {
  if (!isRecord(payload)) {
    return refuse('The payload is not an object', ['payload'])
  }
  if (!('model' in payload)) {
    return refuse('The payload has no "model" key', ['payload', 'model'])
  }
  const result = validateModel(payload.model)
  if (!result.ok) {
    throw new InputRefusedError(toInputProblems(result.problems))
  }
  return isEqual(result.model, part) ? part : deepFreeze(result.model)
}

const requirePayload = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) {
    return refuse('The payload is not an object', ['payload'])
  }
  return payload
}

const requireString = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key]
  if (typeof value !== 'string') {
    return refuse(`The payload has no string "${key}" key`, ['payload', key])
  }
  return value
}

/** Returns the checked model, or throws the problems of `validateModel`. */
const check = (next: unknown): Model => {
  const result = validateModel(next)
  if (!result.ok) {
    throw new InputRefusedError(toInputProblems(result.problems))
  }
  return result.model
}

const addEntity = (part: Model, payload: unknown): Model => {
  const { entity } = requirePayload(payload)
  if (!isRecord(entity)) {
    return refuse('The payload has no "entity" object', ['payload', 'entity'])
  }
  const problems: InputProblem[] = []
  if (typeof entity.id !== 'string') {
    problems.push({ message: 'The entity has no string "id" key', path: ['payload', 'entity', 'id'] })
  }
  if (!isRecord(entity.components)) {
    problems.push({ message: 'The entity has no "components" object', path: ['payload', 'entity', 'components'] })
  }
  if (problems.length > 0) {
    throw new InputRefusedError(problems)
  }
  if (part.entities.some((existing) => existing.id === entity.id)) {
    return refuse(`An entity has the ID "${String(entity.id)}"`, ['payload', 'entity', 'id'])
  }
  const checked = check({ definitions: part.definitions, entities: [...part.entities, entity] })
  const added = checked.entities.at(-1)
  return deepFreeze({
    definitions: part.definitions,
    entities: added === undefined ? part.entities : [...part.entities, added],
  })
}

const removeEntity = (part: Model, payload: unknown): Model => {
  const id = requireString(requirePayload(payload), 'entity')
  if (!part.entities.some((entity) => entity.id === id)) {
    return refuse(`No entity has the ID "${id}"`, ['payload', 'entity'])
  }
  const next = { definitions: part.definitions, entities: part.entities.filter((entity) => entity.id !== id) }
  check(next)
  return deepFreeze(next)
}

const setField = (part: Model, payload: unknown): Model => {
  const fields = requirePayload(payload)
  const problems: InputProblem[] = []
  for (const key of ['entity', 'componentType', 'field'] as const) {
    if (typeof fields[key] !== 'string') {
      problems.push({ message: `The payload has no string "${key}" key`, path: ['payload', key] })
    }
  }
  if (!('value' in fields)) {
    problems.push({ message: 'The payload has no "value" key', path: ['payload', 'value'] })
  }
  if (problems.length > 0) {
    throw new InputRefusedError(problems)
  }
  const { entity: entityId, componentType, field, value } = fields

  const index = part.entities.findIndex((entity) => entity.id === entityId)
  const type = part.definitions.find((definition) => definition.id === componentType)
  if (index < 0) {
    problems.push({ message: `No entity has the ID "${String(entityId)}"`, path: ['payload', 'entity'] })
  }
  if (type === undefined) {
    problems.push({
      message: `No component type has the ID "${String(componentType)}"`,
      path: ['payload', 'componentType'],
    })
  } else if (!type.fields.some((definition) => definition.id === field)) {
    problems.push({
      message: `The component type "${type.label}" has no field with the ID "${String(field)}"`,
      path: ['payload', 'field'],
    })
  }
  const entity = index < 0 ? undefined : part.entities[index]
  if (problems.length > 0 || entity === undefined || typeof componentType !== 'string' || typeof field !== 'string') {
    throw new InputRefusedError(problems)
  }

  const component = Object.hasOwn(entity.components, componentType) ? entity.components[componentType] : undefined
  if (component?.[field] === value) {
    return part
  }
  const withValue = (changed: unknown): unknown[] =>
    part.entities.map((existing, position) => (position === index ? changed : existing))
  const components = { ...entity.components, [componentType]: { ...component, [field]: value } }
  check({ definitions: part.definitions, entities: withValue({ id: entity.id, components }) })
  if (typeof value !== 'string') {
    return part
  }
  const next: Entity = {
    id: entity.id,
    components: { ...entity.components, [componentType]: { ...component, [field]: value } },
  }
  return deepFreeze({
    definitions: part.definitions,
    entities: part.entities.map((existing, position) => (position === index ? next : existing)),
  })
}

const OPERATIONS = ['replace-model', 'add-entity', 'remove-entity', 'set-field'] as const

const handlers: Record<(typeof OPERATIONS)[number], (part: Model, payload: unknown) => Model> = {
  'replace-model': replaceModel,
  'add-entity': addEntity,
  'remove-entity': removeEntity,
  'set-field': setField,
}

/** Throws a `ModelError` when the first model is not correct. */
export const createStore = (options: StoreOptions = {}): ModelSubsystem<Model> => {
  const id = options.id ?? 'store'
  const first = validateModel(options.model === undefined ? { definitions: [], entities: [] } : options.model)
  if (!first.ok) {
    throw new ModelError(first.problems)
  }
  const types = OPERATIONS.map((operation) => `${id}/${operation}`)

  return {
    id,
    inputs: types,
    initial: deepFreeze(first.model),
    apply: (part: Model, input: RecordedInput): Model => {
      const operation = OPERATIONS.find((name) => `${id}/${name}` === input.type)
      if (operation === undefined) {
        return refuse(`The store "${id}" does not apply the input type "${input.type}"`, ['type'])
      }
      return handlers[operation](part, input.payload)
    },
  }
}

/** The functions that make the inputs of a store. Default ID: `store`. */
export const storeInputs = (id = 'store'): StoreInputs => ({
  replaceModel: (model) => ({ type: `${id}/replace-model`, payload: { model } }),
  addEntity: (entity) => ({ type: `${id}/add-entity`, payload: { entity } }),
  removeEntity: (entity) => ({ type: `${id}/remove-entity`, payload: { entity } }),
  setField: (payload) => ({ type: `${id}/set-field`, payload }),
})
