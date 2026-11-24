import { describe, expect, it } from 'vitest'
import { validateModel } from './validate-model.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const CT2 = 'ct_7d1e2f30-4a5b-4c6d-8e7f-90a1b2c3d4e5'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FLD2 = 'fld_11111111-2222-4333-8444-555555555555'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const ENT2 = 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CT3 = 'ct_55555555-6666-4777-8888-999999999999'

const appBar = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: CT,
  label: 'AppBar',
  fields: [{ id: FLD, label: 'title', type: 'string' }],
  ...overrides,
})

const entity = (components: unknown = { [CT]: { [FLD]: 'Wishem' } }, id = ENT): Record<string, unknown> => ({
  id,
  components,
})

const model = (definitions: unknown[] = [appBar()], entities: unknown[] = [entity()]) => ({ definitions, entities })

const errors = (data: unknown) => {
  const result = validateModel(data)
  if (result.ok) {
    throw new Error('expected the model to be not correct')
  }
  return result.problems
}

describe('validateModel', () => {
  describe('a model is definitions and authored state', () => {
    it('accepts one component type and one entity', () => {
      const result = validateModel(model())
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.model.definitions).toHaveLength(1)
        expect(result.model.entities).toHaveLength(1)
        expect(result.warnings).toEqual([])
      }
    })

    it('accepts an empty model', () => {
      const result = validateModel({ definitions: [], entities: [] })
      expect(result.ok && result.model).toEqual({ definitions: [], entities: [] })
      expect(result.ok && result.warnings).toEqual([])
    })

    it('names `entities` when it is not a list', () => {
      const problems = errors({ definitions: [], entities: {} })
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities'])
      expect(problems[0]?.message).toContain('entities')
      expect(problems[0]?.severity).toBe('error')
    })

    it('rejects data that is not an object', () => {
      expect(errors(null)[0]?.path).toEqual([])
      expect(errors([])[0]?.path).toEqual([])
    })

    it('names `definitions` when it is missing', () => {
      const problems = errors({ entities: [] })
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions'])
      expect(problems[0]?.message).toContain('definitions')
    })

    it('names both lists when both are missing', () => {
      expect(errors({}).map((problem) => problem.path)).toEqual([['definitions'], ['entities']])
    })
  })

  describe('definitions are data', () => {
    it('gives the component type and its field', () => {
      const result = validateModel(model([appBar()], []))
      expect(result.ok && result.model.definitions[0]).toEqual({
        id: CT,
        label: 'AppBar',
        fields: [{ id: FLD, label: 'title', type: 'string' }],
      })
    })

    it('names the component type and the field for a type that is not known', () => {
      const bad = appBar({ fields: [{ id: FLD, label: 'title', type: 'number' }] })
      const problems = errors(model([bad], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields', 0, 'type'])
      expect(problems[0]?.message).toContain('AppBar')
      expect(problems[0]?.message).toContain('title')
      expect(problems[0]?.message).toContain('number')
    })

    it('rejects a component type with no `fields` list', () => {
      const problems = errors(model([{ id: CT, label: 'AppBar' }], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields'])
      expect(problems[0]?.message).toContain('AppBar')
    })

    it('rejects a definition that is not an object', () => {
      const problems = errors(model(['x'], []))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions', 0])
    })

    it('rejects a field that is not an object', () => {
      const problems = errors(model([appBar({ fields: ['x'] })], []))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields', 0])
    })
  })

  describe('IDs and labels', () => {
    it('accepts a change of label with no change to the entities', () => {
      const result = validateModel(model([appBar({ label: 'Header' })]))
      expect(result.ok && result.model.definitions[0]?.label).toBe('Header')
      expect(result.ok && result.model.definitions[0]?.id).toBe(CT)
      expect(result.ok && result.model.entities).toEqual([{ id: ENT, components: { [CT]: { [FLD]: 'Wishem' } } }])
    })

    it('names an ID with no prefix', () => {
      const id = '3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
      const problems = errors(model([appBar({ id })], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'id'])
      expect(problems[0]?.message).toContain(id)
    })

    it('names the field and the necessary prefix for an ID of a different kind', () => {
      const bad = appBar({
        fields: [{ id: 'ct_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62', label: 'title', type: 'string' }],
      })
      const problems = errors(model([bad], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields', 0, 'id'])
      expect(problems[0]?.message).toContain('title')
      expect(problems[0]?.message).toContain('fld_')
    })

    it('names an ID of the wrong form', () => {
      const problems = errors(model([appBar({ id: 'app-bar' })], []))
      expect(problems[0]?.message).toContain('app-bar')
    })

    it('rejects an ID with a UUID that is not in lowercase', () => {
      const id = 'ct_3F2A9C1E-8B47-4D0A-9E51-6C2F7A1B0D34'
      const message = errors(model([appBar({ id })], []))[0]?.message
      expect(message).toContain(id)
      expect(message).toContain('UUID in lowercase')
    })

    it.each([
      ['text before the prefix', `x${CT}`],
      ['text after the UUID', `${CT}0`],
      ['a hyphen in place of the underscore', CT.replace('_', '-')],
      ['a first group of 7 characters', CT.replace('3f2a9c1e', '3f2a9c1')],
      ['a last group of 11 characters', CT.slice(0, -1)],
      ['a character that is not hexadecimal', CT.replace('3f2a9c1e', 'zf2a9c1e')],
      ['no hyphen between the third and fourth group', CT.replace('4d0a-9e51', '4d0a9e51')],
    ])('rejects an ID with %s', (_name, id) => {
      const problems = errors(model([appBar({ id })], []))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions', 0, 'id'])
      expect(problems[0]?.message).toContain(id)
    })

    it.each([
      ['a component type', () => model([appBar({ id: 42 })], []), ['definitions', 0, 'id']],
      [
        'a field',
        () => model([appBar({ fields: [{ id: 42, label: 'title', type: 'string' }] })], []),
        ['definitions', 0, 'fields', 0, 'id'],
      ],
      ['an entity', () => model([appBar()], [entity({}, 42 as unknown as string)]), ['entities', 0, 'id']],
    ])('rejects an ID that is not a string for %s', (_name, build, path) => {
      const problems = errors(build())
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(path)
    })

    it('names the entity ID when it has the wrong prefix', () => {
      const problems = errors(model([appBar()], [entity({}, FLD)]))
      expect(problems[0]?.path).toEqual(['entities', 0, 'id'])
      expect(problems[0]?.message).toContain('e_')
    })

    it('names a duplicate component type ID', () => {
      const problems = errors(model([appBar(), appBar({ label: 'Other' })], []))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions', 1, 'id'])
      expect(problems[0]?.message).toContain(CT)
    })

    it('names a duplicate field ID in one component type', () => {
      const bad = appBar({
        fields: [
          { id: FLD, label: 'a', type: 'string' },
          { id: FLD, label: 'b', type: 'string' },
        ],
      })
      const problems = errors(model([bad], []))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields', 1, 'id'])
      expect(problems[0]?.message).toContain(FLD)
    })

    it('accepts one field ID in two component types', () => {
      const other = appBar({ id: CT2, label: 'Other' })
      expect(validateModel(model([appBar(), other], [])).ok).toBe(true)
    })

    it('names a duplicate entity ID', () => {
      const problems = errors(model([appBar()], [entity(), entity()]))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities', 1, 'id'])
      expect(problems[0]?.message).toContain(ENT)
    })

    it('names the field with an empty label', () => {
      const bad = appBar({ fields: [{ id: FLD, label: '', type: 'string' }] })
      const problems = errors(model([bad], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'fields', 0, 'label'])
      expect(problems[0]?.message).toContain(FLD)
    })

    it('names the component type with an empty label', () => {
      const problems = errors(model([appBar({ label: '' })], []))
      expect(problems[0]?.path).toEqual(['definitions', 0, 'label'])
    })

    it.each([
      ['a number', 42],
      ['a missing label', undefined],
      ['null', null],
    ])('rejects a label that is %s', (_name, label) => {
      const type = errors(model([appBar({ label })], []))
      expect(type).toHaveLength(1)
      expect(type[0]?.path).toEqual(['definitions', 0, 'label'])
      const field = errors(model([appBar({ fields: [{ id: FLD, label, type: 'string' }] })], []))
      expect(field).toHaveLength(1)
      expect(field[0]?.path).toEqual(['definitions', 0, 'fields', 0, 'label'])
    })

    it('accepts a label of one character that is a space', () => {
      expect(validateModel(model([appBar({ label: ' ' })], [])).ok).toBe(true)
    })
  })

  describe('authored state agrees with the definitions', () => {
    it('accepts an entity with one component', () => {
      expect(validateModel(model()).ok).toBe(true)
    })

    it('names the entity and the key for a component type that is not defined', () => {
      const key = 'ct_9a9a9a9a-0000-4000-8000-000000000000'
      const problems = errors(model([appBar()], [entity({ [key]: {} })]))
      expect(problems[0]?.path).toEqual(['entities', 0, 'components', key])
      expect(problems[0]?.message).toContain(ENT)
      expect(problems[0]?.message).toContain(key)
    })

    it('names the entity, the component type, and the key for a field that is not declared', () => {
      const problems = errors(model([appBar()], [entity({ [CT]: { [FLD2]: 'x' } })]))
      expect(problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD2])
      expect(problems[0]?.message).toContain(ENT)
      expect(problems[0]?.message).toContain('AppBar')
      expect(problems[0]?.message).toContain(FLD2)
    })

    it('names the entity and the field for a value of the wrong type', () => {
      const problems = errors(model([appBar()], [entity({ [CT]: { [FLD]: 42 } })]))
      expect(problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD])
      expect(problems[0]?.message).toContain(ENT)
      expect(problems[0]?.message).toContain('title')
    })

    it('accepts an omitted field', () => {
      expect(validateModel(model([appBar()], [entity({ [CT]: {} })])).ok).toBe(true)
    })

    it('rejects an entity with no `components` record', () => {
      const problems = errors(model([appBar()], [{ id: ENT }]))
      expect(problems[0]?.path).toEqual(['entities', 0, 'components'])
      expect(problems[0]?.message).toContain(ENT)
    })

    it.each([
      ['a list', []],
      ['a string', 'x'],
      ['null', null],
    ])('rejects `components` that is %s', (_name, components) => {
      const problems = errors(model([appBar()], [{ id: ENT, components }]))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities', 0, 'components'])
    })

    it('rejects an entity that is not an object', () => {
      const problems = errors(model([appBar()], ['x']))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities', 0])
    })

    it('names the entity and the component type for a component that is not an object', () => {
      const problems = errors(model([appBar()], [entity({ [CT]: 'x' })]))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities', 0, 'components', CT])
      expect(problems[0]?.message).toContain(ENT)
      expect(problems[0]?.message).toContain('AppBar')
    })

    it.each([
      ['null', null],
      ['a boolean', true],
      ['an object', {}],
      ['a list', ['a']],
    ])('rejects the value %s for a string field', (_name, value) => {
      const problems = errors(model([appBar()], [entity({ [CT]: { [FLD]: value } })]))
      expect(problems).toHaveLength(1)
      expect(problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD])
    })

    it('gives every problem of a model with more than one', () => {
      const entities = [entity({ [CT]: { [FLD]: 1 } }), entity({ [CT]: { [FLD]: 2 } }, ENT2)]
      expect(errors(model([appBar()], entities))).toHaveLength(2)
    })

    it('accepts two entities with different IDs', () => {
      expect(validateModel(model([appBar()], [entity(), entity({}, ENT2)])).ok).toBe(true)
    })
  })

  describe('component types with the same label', () => {
    it('warns with the label and the two IDs and keeps the model correct', () => {
      const result = validateModel(model([appBar(), appBar({ id: CT2 })], []))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.warnings).toHaveLength(1)
        const warning = result.warnings.at(0)
        expect(warning?.severity).toBe('warning')
        expect(warning?.message).toContain('AppBar')
        expect(warning?.message).toContain(CT)
        expect(warning?.message).toContain(CT2)
        expect(warning?.path).toEqual(['definitions'])
      }
    })

    it('warns for each component type that repeats a label', () => {
      const result = validateModel(model([appBar(), appBar({ id: CT2 }), appBar({ id: CT3 })], []))
      expect(result.ok && result.warnings).toHaveLength(2)
      if (result.ok) {
        expect(result.warnings.every((warning) => warning.message.includes(CT))).toBe(true)
        expect(result.warnings.some((warning) => warning.message.includes(CT2))).toBe(true)
        expect(result.warnings.some((warning) => warning.message.includes(CT3))).toBe(true)
      }
    })

    it('does not warn for component types with different labels', () => {
      const result = validateModel(model([appBar(), appBar({ id: CT2, label: 'Other' })], []))
      expect(result.ok && result.warnings).toEqual([])
    })
  })
})
