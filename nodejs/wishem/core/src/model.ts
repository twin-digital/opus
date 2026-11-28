/** An ID has a prefix for its kind (`ct_`, `fld_`, or `e_`) and a UUID in lowercase. */
export type Id = string

export type FieldType = 'string' | 'number' | 'boolean' | 'reference' | 'reference-list'

/** The field types, in the order of the specification. */
export const FIELD_TYPES: readonly FieldType[] = ['string', 'number', 'boolean', 'reference', 'reference-list']

/** A reference is the ID of an entity. A reference list is a list of distinct entity IDs. */
export type FieldValue = string | number | boolean | readonly Id[]

export interface FieldDefinition {
  id: Id
  label: string
  type: FieldType
}

export interface ComponentTypeDefinition {
  id: Id
  label: string
  fields: FieldDefinition[]
}

export interface Entity {
  id: Id
  /** Component type ID to a record of field ID to value. */
  components: Record<Id, Record<Id, FieldValue>>
}

export interface Model {
  definitions: ComponentTypeDefinition[]
  entities: Entity[]
}

/** A snapshot has the same shape as a model. */
export type Snapshot = Model

export interface Problem {
  severity: 'error' | 'warning'
  message: string
  /** Where the problem is in the model data, such as `['definitions', 0, 'fields', 1, 'type']`. */
  path: (string | number)[]
  /** The file that has the problem. The host sets it. The core does not. */
  source?: string
}

export type ValidationResult = { ok: true; model: Model; warnings: Problem[] } | { ok: false; problems: Problem[] }
