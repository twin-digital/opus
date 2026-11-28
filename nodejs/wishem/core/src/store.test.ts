import { InputRefusedError } from '@thrashplay/wishem-hub'
import type { ModelSubsystem, RecordedInput } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import { ModelError } from './errors.js'
import type { Entity, Model } from './model.js'
import { createStore, storeInputs } from './store.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const CT2 = 'ct_77777777-8888-4999-8aaa-bbbbbbbbbbbb'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FLD2 = 'fld_11111111-2222-4333-8444-555555555555'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const ENT2 = 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const MISSING = 'e_00000000-0000-4000-8000-000000000000'

const definitions = () => [
  { id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' as const }] },
  { id: CT2, label: 'Footer', fields: [{ id: FLD2, label: 'text', type: 'string' as const }] },
]

const workbench = (title = 'Wishem'): Model => ({
  definitions: definitions(),
  entities: [{ id: ENT, components: { [CT]: { [FLD]: title } } }],
})

const twoEntities = (): Model => ({
  definitions: definitions(),
  entities: [
    { id: ENT, components: { [CT]: { [FLD]: 'Wishem' } } },
    { id: ENT2, components: { [CT2]: { [FLD2]: 'Footer' } } },
  ],
})

let seq = 0
/** Calls `apply` with a recorded input that has a frozen JSON copy of the payload. */
const send = (store: ModelSubsystem<Model>, part: Model, type: string, payload?: unknown): Model => {
  seq += 1
  const recorded: RecordedInput = {
    seq,
    source: 'test',
    type,
    payload: payload === undefined ? null : (JSON.parse(JSON.stringify(payload)) as unknown),
  }
  return store.apply(part, recorded, { read: () => ({}) })
}

const refusal = (run: () => unknown): InputRefusedError => {
  try {
    run()
  } catch (error) {
    if (error instanceof InputRefusedError) {
      return error
    }
    throw error
  }
  throw new Error('The input was not refused')
}

const frozenDeep = (value: unknown): boolean =>
  typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(frozenDeep))

describe('createStore', () => {
  it('is a model subsystem with the ID store and seven input types', () => {
    const store = createStore()
    expect(store.id).toBe('store')
    expect(store.inputs).toEqual([
      'store/replace-model',
      'store/add-entity',
      'store/remove-entity',
      'store/set-field',
      'store/clear-field',
      'store/add-reference',
      'store/remove-reference',
    ])
  })

  it('starts from the first model with the definitions and the entities', () => {
    const part = createStore({ model: workbench() }).initial
    expect(part.definitions[0]?.label).toBe('AppBar')
    expect(part.entities[0]?.id).toBe(ENT)
    expect(part).toEqual(workbench())
  })

  it('freezes the first model', () => {
    expect(frozenDeep(createStore({ model: workbench() }).initial)).toBe(true)
  })

  it('does not change the object that gave the first model', () => {
    const model = workbench()
    createStore({ model })
    expect(Object.isFrozen(model)).toBe(false)
  })

  it('uses a different ID for the subsystem and for the input types', () => {
    const store = createStore({ id: 'product' })
    expect(store.id).toBe('product')
    expect(store.inputs).toContain('product/set-field')
    expect(store.inputs).not.toContain('store/set-field')
    expect(store.inputs.every((type) => type.startsWith('product/'))).toBe(true)
  })

  it('starts from an empty model when no model is given', () => {
    expect(createStore().initial).toEqual({ definitions: [], entities: [] })
    expect(createStore({ id: 'product' }).initial).toEqual({ definitions: [], entities: [] })
  })

  it('throws a ModelError with the problem when the first model is not correct', () => {
    const model = { definitions: [], entities: [{ id: ENT, components: { [CT]: {} } }] }
    let error: unknown
    try {
      createStore({ model })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ModelError)
    expect((error as ModelError).problems[0]?.message).toContain('not defined')
  })

  it('throws a ModelError when the first model is not an object', () => {
    expect(() => createStore({ model: 7 })).toThrow(ModelError)
    expect(() => createStore({ model: null })).toThrow(ModelError)
  })

  it('refuses an input type of a store with a different ID', () => {
    const store = createStore({ id: 'product', model: workbench() })
    expect(() => send(store, store.initial, 'store/set-field', { entity: ENT })).toThrow(InputRefusedError)
  })

  it('gives a new inputs list on each call', () => {
    expect(createStore().inputs).not.toBe(createStore().inputs)
  })
})

describe('replace-model', () => {
  it('puts a correct model in the part', () => {
    const store = createStore({ model: workbench() })
    const next = send(store, store.initial, 'store/replace-model', { model: workbench('Wishem workbench') })
    expect(next.entities[0]?.components[CT]?.[FLD]).toBe('Wishem workbench')
    expect(frozenDeep(next)).toBe(true)
  })

  it('keeps the same part object when the model is equal', () => {
    const store = createStore({ model: workbench() })
    expect(send(store, store.initial, 'store/replace-model', { model: workbench() })).toBe(store.initial)
  })

  it('keeps the same part object when only the order of the keys differs', () => {
    const base = {
      definitions: [
        {
          id: CT,
          label: 'AppBar',
          fields: [
            { id: FLD, label: 'title', type: 'string' as const },
            { id: FLD2, label: 'text', type: 'string' as const },
          ],
        },
      ],
      entities: [{ id: ENT, components: { [CT]: { [FLD]: 'A', [FLD2]: 'B' } } }],
    }
    const store = createStore({ model: base })
    const reordered = {
      entities: [{ components: { [CT]: { [FLD2]: 'B', [FLD]: 'A' } }, id: ENT }],
      definitions: base.definitions,
    }
    expect(send(store, store.initial, 'store/replace-model', { model: reordered })).toBe(store.initial)
  })

  it('refuses a model that is not correct, with the paths of the model', () => {
    const store = createStore({ model: workbench() })
    const duplicate = { definitions: [...definitions(), definitions()[0]], entities: [] }
    const error = refusal(() => send(store, store.initial, 'store/replace-model', { model: duplicate }))
    expect(error.problems).toEqual([
      {
        message: `Component type "AppBar" has the ID "${CT}", which another component type has`,
        path: ['definitions', 2, 'id'],
      },
    ])
  })

  it('applies a model that has only a warning', () => {
    const store = createStore()
    const sameLabel = {
      definitions: [definitions()[0], { id: CT2, label: 'AppBar', fields: [] }],
      entities: [],
    }
    const next = send(store, store.initial, 'store/replace-model', { model: sameLabel })
    expect(next.definitions).toHaveLength(2)
  })

  it.each([
    ['no payload', undefined, ['payload']],
    ['a payload that is not an object', 5, ['payload']],
    ['a payload that is an array', [], ['payload']],
    ['a payload with no model key', {}, ['payload', 'model']],
  ])('refuses %s', (_name, payload, path) => {
    const store = createStore()
    const error = refusal(() => send(store, store.initial, 'store/replace-model', payload))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.path).toEqual(path)
  })

  it('refuses a model that is not an object, with the path of the model', () => {
    const store = createStore()
    const error = refusal(() => send(store, store.initial, 'store/replace-model', { model: 'text' }))
    expect(error.problems).toEqual([{ message: 'The model is not an object', path: [] }])
  })

  it('refuses an input type that the store does not apply', () => {
    const store = createStore()
    expect(() => send(store, store.initial, 'store/unknown', {})).toThrow(InputRefusedError)
  })
})

describe('storeInputs', () => {
  it('makes the replace-model input', () => {
    const model = workbench()
    expect(storeInputs().replaceModel(model)).toEqual({ type: 'store/replace-model', payload: { model } })
  })

  it('uses the ID for the type of each input', () => {
    const inputs = storeInputs('product')
    const entity: Entity = { id: ENT, components: {} }
    expect(inputs.replaceModel(workbench()).type).toBe('product/replace-model')
    expect(inputs.addEntity(entity).type).toBe('product/add-entity')
    expect(inputs.removeEntity(ENT).type).toBe('product/remove-entity')
    expect(inputs.setField({ entity: ENT, componentType: CT, field: FLD, value: 'x' }).type).toBe('product/set-field')
    expect(inputs.clearField({ entity: ENT, componentType: CT, field: FLD }).type).toBe('product/clear-field')
  })

  it('makes the payloads of the small inputs', () => {
    const inputs = storeInputs()
    const entity: Entity = { id: ENT, components: {} }
    const set = { entity: ENT, componentType: CT, field: FLD, value: 'x' }
    expect(inputs.addEntity(entity).payload).toEqual({ entity })
    expect(inputs.addEntity(entity).payload).not.toHaveProperty('index')
    expect(inputs.addEntity(entity, 0).payload).toEqual({ entity, index: 0 })
    expect(inputs.removeEntity(ENT).payload).toEqual({ entity: ENT })
    expect(inputs.setField(set).payload).toEqual(set)
    expect(inputs.clearField({ entity: ENT, componentType: CT, field: FLD }).payload).toEqual({
      entity: ENT,
      componentType: CT,
      field: FLD,
    })
  })

  it('gives inputs that the store of the same ID applies', () => {
    const store = createStore({ id: 'product', model: workbench() })
    const input = storeInputs('product').replaceModel(workbench('Product'))
    const next = send(store, store.initial, input.type, input.payload)
    expect(next.entities[0]?.components[CT]?.[FLD]).toBe('Product')
  })
})

describe('add-entity', () => {
  const newEntity = (): Entity => ({ id: ENT2, components: { [CT2]: { [FLD2]: 'Footer' } } })

  it('adds the entity at the end of the list', () => {
    const store = createStore({ model: workbench() })
    const next = send(store, store.initial, 'store/add-entity', { entity: newEntity() })
    expect(next.entities.map((entity) => entity.id)).toEqual([ENT, ENT2])
    expect(next.entities[1]).toEqual(newEntity())
    expect(frozenDeep(next)).toBe(true)
  })

  it('keeps the earlier entity and the definitions as the same objects', () => {
    const store = createStore({ model: workbench() })
    const next = send(store, store.initial, 'store/add-entity', { entity: newEntity() })
    expect(next.entities[0]).toBe(store.initial.entities[0])
    expect(next.definitions).toBe(store.initial.definitions)
    expect(store.initial.entities).toHaveLength(1)
  })

  it('holds the checked entity, with no key that is not in the form', () => {
    const store = createStore({ model: workbench() })
    const entity = { ...newEntity(), extra: 1 }
    const next = send(store, store.initial, 'store/add-entity', { entity })
    expect(next.entities[1]).toEqual(newEntity())
  })

  it('refuses an ID that exists, with a problem that names the ID', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity: { id: ENT, components: {} } }))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(ENT)
    expect(error.problems[0]?.path).toEqual(['payload', 'entity', 'id'])
  })

  it('refuses an entity with a component that the model does not allow, with the path of the model', () => {
    const store = createStore({ model: workbench() })
    const entity = { id: ENT2, components: { [CT]: { [FLD2]: 'x' } } }
    const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity }))
    expect(error.problems[0]?.path).toEqual(['entities', 1, 'components', CT, FLD2])
  })

  it('refuses an ID that is not correct', () => {
    const store = createStore()
    const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity: { id: 'x', components: {} } }))
    expect(error.problems[0]?.path).toEqual(['entities', 0, 'id'])
  })

  it('accepts an ID again after remove-entity of the same ID', () => {
    const store = createStore({ model: workbench() })
    const removed = send(store, store.initial, 'store/remove-entity', { entity: ENT })
    const added = send(store, removed, 'store/add-entity', { entity: workbench().entities[0] })
    expect(added.entities).toEqual(workbench().entities)
  })

  it.each([
    ['no payload', undefined, ['payload']],
    ['a payload that is not an object', 'text', ['payload']],
    ['an empty payload', {}, ['payload', 'entity']],
    ['an entity that is not an object', { entity: 7 }, ['payload', 'entity']],
    ['an entity that is an array', { entity: [] }, ['payload', 'entity']],
    ['an entity with no ID', { entity: { components: {} } }, ['payload', 'entity', 'id']],
    ['an entity with an ID that is not a string', { entity: { id: 7, components: {} } }, ['payload', 'entity', 'id']],
    ['an entity with no components', { entity: { id: ENT2 } }, ['payload', 'entity', 'components']],
    [
      'an entity with components that are not an object',
      { entity: { id: ENT2, components: [] } },
      ['payload', 'entity', 'components'],
    ],
  ])('refuses %s', (_name, payload, path) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/add-entity', payload))
    expect(error.problems.map((problem) => problem.path)).toContainEqual(path)
  })

  describe('with an index', () => {
    const ENT3 = 'e_33333333-4444-4555-8666-777777777777'
    const third = (): Entity => ({ id: ENT3, components: { [CT]: { [FLD]: 'Third' } } })
    const add = (store: ModelSubsystem<Model>, index?: unknown) =>
      send(
        store,
        store.initial,
        'store/add-entity',
        index === undefined ? { entity: third() } : { entity: third(), index },
      )
    const ids = (part: Model) => part.entities.map((entity) => entity.id)

    it.each([
      [0, [ENT3, ENT, ENT2]],
      [1, [ENT, ENT3, ENT2]],
      [2, [ENT, ENT2, ENT3]],
      [undefined, [ENT, ENT2, ENT3]],
    ])('puts the entity for the index %s at its position', (index, order) => {
      const store = createStore({ model: twoEntities() })
      const next = add(store, index)
      expect(ids(next)).toEqual(order)
      expect(next.entities.find((entity) => entity.id === ENT3)).toEqual(third())
    })

    it('keeps the other entities as the same objects and freezes the part', () => {
      const store = createStore({ model: twoEntities() })
      const next = add(store, 0)
      expect(next.entities[1]).toBe(store.initial.entities[0])
      expect(next.entities[2]).toBe(store.initial.entities[1])
      expect(frozenDeep(next)).toBe(true)
    })

    it.each([3, -1, 1.5, '1', null])('refuses the index %j', (index) => {
      const store = createStore({ model: twoEntities() })
      const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity: third(), index }))
      expect(error.problems).toEqual([
        { message: 'The index is not an integer from 0 to 2', path: ['payload', 'index'] },
      ])
    })

    it('gives each problem of a refused index and an entity that is not correct', () => {
      const store = createStore({ model: twoEntities() })
      const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity: {}, index: 7 }))
      expect(error.problems.map((problem) => problem.path)).toEqual([
        ['payload', 'entity', 'id'],
        ['payload', 'entity', 'components'],
        ['payload', 'index'],
      ])
    })

    it('refuses an ID that exists', () => {
      const store = createStore({ model: twoEntities() })
      const error = refusal(() =>
        send(store, store.initial, 'store/add-entity', { entity: { id: ENT, components: {} }, index: 0 }),
      )
      expect(error.problems[0]?.path).toEqual(['payload', 'entity', 'id'])
    })

    it('refuses an entity that the model does not allow, with the path of its position', () => {
      const store = createStore({ model: twoEntities() })
      const entity = { id: ENT3, components: { [CT]: { [FLD2]: 'x' } } }
      const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity, index: 0 }))
      expect(error.problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD2])
    })
  })

  it('gives one problem for each fault of the entity form', () => {
    const store = createStore()
    const error = refusal(() => send(store, store.initial, 'store/add-entity', { entity: {} }))
    expect(error.problems.map((problem) => problem.path)).toEqual([
      ['payload', 'entity', 'id'],
      ['payload', 'entity', 'components'],
    ])
  })
})

const FLD3 = 'fld_22222222-3333-4444-8555-666666666666'
const FLD4 = 'fld_33333333-4444-4555-8666-777777777777'
const FLD5 = 'fld_44444444-5555-4666-8777-888888888888'
const ENT3 = 'e_bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

/** A model with a field of each type, a `list` entity that holds a reference, and a `task` entity. */
const typedModel = (list: Record<string, unknown> = { [FLD4]: ENT2 }): Model =>
  ({
    definitions: [
      {
        id: CT,
        label: 'Item',
        fields: [
          { id: FLD, label: 'text', type: 'string' },
          { id: FLD2, label: 'count', type: 'number' },
          { id: FLD3, label: 'done', type: 'boolean' },
          { id: FLD4, label: 'next', type: 'reference' },
          { id: FLD5, label: 'cards', type: 'reference-list' },
        ],
      },
    ],
    entities: [
      { id: ENT, components: { [CT]: list } },
      { id: ENT2, components: {} },
    ],
  }) as Model

describe('remove-entity with references', () => {
  it('refuses an entity that a different entity refers to, and the part is the same object', () => {
    const store = createStore({ model: typedModel() })
    const error = refusal(() => send(store, store.initial, 'store/remove-entity', { entity: ENT2 }))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(ENT)
    expect(error.problems[0]?.message).toContain('next')
    expect(error.problems[0]?.message).toContain(ENT2)
    expect(store.initial.entities).toHaveLength(2)
  })

  it('removes an entity that refers only to itself', () => {
    const store = createStore({ model: typedModel({ [FLD4]: ENT }) })
    const next = send(store, store.initial, 'store/remove-entity', { entity: ENT })
    expect(next.entities.map((entity) => entity.id)).toEqual([ENT2])
  })
})

/** A model with a `deck` entity that holds a `reference-list` field, and two card entities. */
const listModel = (cards?: string[]): Model => ({
  definitions: [{ id: CT, label: 'Deck', fields: [{ id: FLD5, label: 'cards', type: 'reference-list' }] }],
  entities: [
    { id: ENT, components: { [CT]: cards === undefined ? {} : { [FLD5]: cards } } },
    { id: ENT2, components: {} },
    { id: ENT3, components: {} },
  ],
})

describe('remove-entity with a reference-list', () => {
  it('refuses an entity that a list of a different entity names, and keeps the part', () => {
    const store = createStore({ model: listModel([ENT2, ENT3]) })
    const error = refusal(() => send(store, store.initial, 'store/remove-entity', { entity: ENT2 }))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(ENT)
    expect(error.problems[0]?.message).toContain('"cards"')
    expect(error.problems[0]?.message).toContain(ENT2)
    expect(store.initial.entities).toHaveLength(3)
  })

  it('removes an entity whose list names only its own entity', () => {
    const store = createStore({ model: listModel([ENT]) })
    const next = send(store, store.initial, 'store/remove-entity', { entity: ENT })
    expect(next.entities.map((entity) => entity.id)).toEqual([ENT2, ENT3])
  })
})

describe('remove-entity', () => {
  it('removes the entity', () => {
    const store = createStore({ model: twoEntities() })
    const next = send(store, store.initial, 'store/remove-entity', { entity: ENT })
    expect(next.entities).toEqual([twoEntities().entities[1]])
    expect(next.entities[0]).toBe(store.initial.entities[1])
    expect(next.definitions).toBe(store.initial.definitions)
    expect(store.initial.entities).toHaveLength(2)
    expect(frozenDeep(next)).toBe(true)
  })

  it('refuses an ID that no entity has, with a problem that names the ID', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/remove-entity', { entity: MISSING }))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(MISSING)
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('refuses an entity that is not a string, with a problem about the form', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/remove-entity', { entity: 7 }))
    expect(error.problems[0]?.message).toContain('string')
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('refuses the second removal of one ID', () => {
    const store = createStore({ model: twoEntities() })
    const next = send(store, store.initial, 'store/remove-entity', { entity: ENT })
    expect(() => send(store, next, 'store/remove-entity', { entity: ENT })).toThrow(InputRefusedError)
  })

  it.each([
    ['no payload', undefined, ['payload']],
    ['a payload that is not an object', 3, ['payload']],
    ['an empty payload', {}, ['payload', 'entity']],
  ])('refuses %s', (_name, payload, path) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/remove-entity', payload))
    expect(error.problems.map((problem) => problem.path)).toEqual([path])
  })
})

describe('set-field', () => {
  const set = (value: unknown = 'Wishem workbench') => ({ entity: ENT, componentType: CT, field: FLD, value })

  it('sets the value and keeps each other entity as the same object', () => {
    const store = createStore({ model: twoEntities() })
    const next = send(store, store.initial, 'store/set-field', set())
    expect(next.entities[0]?.components[CT]?.[FLD]).toBe('Wishem workbench')
    expect(next.entities[1]).toBe(store.initial.entities[1])
    expect(next.definitions).toBe(store.initial.definitions)
    expect(frozenDeep(next)).toBe(true)
  })

  it('leaves the earlier part unchanged', () => {
    const store = createStore({ model: twoEntities() })
    send(store, store.initial, 'store/set-field', set())
    expect(store.initial.entities[0]?.components[CT]?.[FLD]).toBe('Wishem')
    expect(store.initial).toEqual(twoEntities())
  })

  it('keeps the other values of the component and the other components', () => {
    const model: Model = {
      definitions: [
        {
          id: CT,
          label: 'AppBar',
          fields: [
            { id: FLD, label: 'title', type: 'string' },
            { id: FLD2, label: 'subtitle', type: 'string' },
          ],
        },
        { id: CT2, label: 'Footer', fields: [] },
      ],
      entities: [{ id: ENT, components: { [CT]: { [FLD]: 'a', [FLD2]: 'b' }, [CT2]: {} } }],
    }
    const store = createStore({ model })
    const next = send(store, store.initial, 'store/set-field', set('c'))
    expect(next.entities[0]?.components).toEqual({ [CT]: { [FLD]: 'c', [FLD2]: 'b' }, [CT2]: {} })
    expect(next.entities[0]?.components[CT2]).toBe(store.initial.entities[0]?.components[CT2])
  })

  it('adds the component when the entity has none of that type', () => {
    const store = createStore({ model: twoEntities() })
    const next = send(store, store.initial, 'store/set-field', { ...set('Top'), entity: ENT2 })
    expect(next.entities[1]?.components).toEqual({ [CT2]: { [FLD2]: 'Footer' }, [CT]: { [FLD]: 'Top' } })
  })

  it('adds the component to an entity with no components', () => {
    const model = { ...workbench(), entities: [{ id: ENT, components: {} }] }
    const store = createStore({ model })
    const next = send(store, store.initial, 'store/set-field', set('Top'))
    expect(next.entities[0]?.components).toEqual({ [CT]: { [FLD]: 'Top' } })
  })

  it('returns the same part object when the value is equal', () => {
    const store = createStore({ model: workbench() })
    const once = send(store, store.initial, 'store/set-field', set('Changed'))
    const twice = send(store, once, 'store/set-field', set('Changed'))
    expect(once).not.toBe(store.initial)
    expect(twice).toBe(once)
  })

  describe('with the five field types', () => {
    const setTyped = (field: string, value: unknown) => ({ entity: ENT, componentType: CT, field, value })
    const setList = (value: unknown) => setTyped(FLD5, value)

    it('sets a number and a boolean', () => {
      const store = createStore({ model: typedModel() })
      const withNumber = send(store, store.initial, 'store/set-field', setTyped(FLD2, 3))
      const both = send(store, withNumber, 'store/set-field', setTyped(FLD3, true))
      expect(both.entities[0]?.components[CT]).toEqual({ [FLD4]: ENT2, [FLD2]: 3, [FLD3]: true })
    })

    it.each([
      ['string', FLD, 'x'],
      ['number', FLD2, 3],
      ['boolean', FLD3, false],
      ['reference', FLD4, ENT2],
      ['reference-list', FLD5, [ENT2]],
    ])('returns the same part object for the same value of a %s field', (_type, field, value) => {
      const store = createStore({
        model: typedModel({ [FLD]: 'x', [FLD2]: 3, [FLD3]: false, [FLD4]: ENT2, [FLD5]: [ENT2] }),
      })
      expect(send(store, store.initial, 'store/set-field', setTyped(field, value))).toBe(store.initial)
    })

    it('sets a list, and gives the same part object for an equal list in a new object', () => {
      const store = createStore({ model: listModel([ENT2, ENT3]) })
      const same = send(store, store.initial, 'store/set-field', setList([ENT2, ENT3]))
      expect(same).toBe(store.initial)
    })

    it('gives the new order for the same IDs in a different order', () => {
      const store = createStore({ model: listModel([ENT2, ENT3]) })
      const next = send(store, store.initial, 'store/set-field', setList([ENT3, ENT2]))
      expect(next).not.toBe(store.initial)
      expect(next.entities[0]?.components[CT]?.[FLD5]).toEqual([ENT3, ENT2])
      expect(next.entities[1]).toBe(store.initial.entities[1])
    })

    it('sets a list on a field with no value, and sets an empty list', () => {
      const store = createStore({ model: listModel() })
      const filled = send(store, store.initial, 'store/set-field', setList([ENT2]))
      expect(filled.entities[0]?.components[CT]?.[FLD5]).toEqual([ENT2])
      const empty = send(store, filled, 'store/set-field', setList([]))
      expect(empty.entities[0]?.components[CT]?.[FLD5]).toEqual([])
      expect(send(store, empty, 'store/set-field', setList([]))).toBe(empty)
    })

    it('refuses a list with an ID two times', () => {
      const store = createStore({ model: listModel() })
      const error = refusal(() => send(store, store.initial, 'store/set-field', setList([ENT2, ENT2])))
      expect(error.problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD5, 1])
    })

    it('returns the same part object for a reference set two times in a row', () => {
      const store = createStore({ model: typedModel({}) })
      const once = send(store, store.initial, 'store/set-field', setTyped(FLD4, ENT2))
      expect(send(store, once, 'store/set-field', setTyped(FLD4, ENT2))).toBe(once)
    })

    it('refuses the text "3" for a number field that holds 3', () => {
      const store = createStore({ model: typedModel({ [FLD2]: 3 }) })
      const error = refusal(() => send(store, store.initial, 'store/set-field', setTyped(FLD2, '3')))
      expect(error.problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD2])
    })

    it('refuses a reference to an entity that does not exist, with a problem that names the ID', () => {
      const store = createStore({ model: typedModel() })
      const error = refusal(() => send(store, store.initial, 'store/set-field', setTyped(FLD4, MISSING)))
      expect(error.problems).toHaveLength(1)
      expect(error.problems[0]?.message).toContain(MISSING)
    })
  })

  it('refuses an entity that does not exist, with a problem that names the ID', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/set-field', { ...set(), entity: MISSING }))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(MISSING)
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('refuses a component type that is not defined', () => {
    const store = createStore({ model: workbench() })
    const unknown = 'ct_99999999-8888-4777-8666-555555555555'
    const error = refusal(() => send(store, store.initial, 'store/set-field', { ...set(), componentType: unknown }))
    expect(error.problems[0]?.message).toContain(unknown)
    expect(error.problems[0]?.path).toEqual(['payload', 'componentType'])
  })

  it('refuses a field of a different component type, with a problem that names the field', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/set-field', { ...set(), field: FLD2 }))
    expect(error.problems[0]?.message).toContain(FLD2)
    expect(error.problems[0]?.path).toEqual(['payload', 'field'])
  })

  it.each([
    ['a number', 7],
    ['null', null],
    ['an object', { a: 1 }],
  ])('refuses a value that is %s, with the path of the model', (_name, value) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/set-field', set(value)))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.path).toEqual(['entities', 0, 'components', CT, FLD])
  })

  it.each([
    ['no payload', undefined, [['payload']]],
    ['a payload that is not an object', 'text', [['payload']]],
    [
      'an empty payload',
      {},
      [
        ['payload', 'entity'],
        ['payload', 'componentType'],
        ['payload', 'field'],
        ['payload', 'value'],
      ],
    ],
    ['no value', { entity: ENT, componentType: CT, field: FLD }, [['payload', 'value']]],
  ])('refuses %s', (_name, payload, paths) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/set-field', payload))
    expect(error.problems.map((problem) => problem.path)).toEqual(paths)
  })

  it.each([
    ['entity', { ...set(), entity: 1 }],
    ['componentType', { ...set(), componentType: null }],
    ['field', { ...set(), field: [] }],
  ])('refuses a %s that is not a string, with a problem about the form', (key, payload) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/set-field', payload))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.path).toEqual(['payload', key])
    expect(error.problems[0]?.message).toContain(key)
  })
})

describe('clear-field', () => {
  const clear = (field = FLD2) => ({ entity: ENT, componentType: CT, field })

  it('removes the value, keeps the empty component, and keeps the other entity as the same object', () => {
    const model = typedModel({ [FLD2]: 3 })
    const store = createStore({ model })
    const next = send(store, store.initial, 'store/clear-field', clear())
    expect(next.entities[0]?.components).toEqual({ [CT]: {} })
    expect(Object.hasOwn(next.entities[0]?.components[CT] ?? {}, FLD2)).toBe(false)
    expect(next.entities[1]).toBe(store.initial.entities[1])
    expect(next.definitions).toBe(store.initial.definitions)
    expect(frozenDeep(next)).toBe(true)
    expect(store.initial.entities[0]?.components[CT]?.[FLD2]).toBe(3)
  })

  it('keeps the other values and the other components', () => {
    const model: Model = {
      definitions: [
        {
          id: CT,
          label: 'AppBar',
          fields: [
            { id: FLD, label: 'title', type: 'string' },
            { id: FLD2, label: 'subtitle', type: 'string' },
          ],
        },
        { id: CT2, label: 'Footer', fields: [] },
      ],
      entities: [{ id: ENT, components: { [CT]: { [FLD]: 'a', [FLD2]: 'b' }, [CT2]: {} } }],
    }
    const store = createStore({ model })
    const next = send(store, store.initial, 'store/clear-field', clear(FLD))
    expect(next.entities[0]?.components).toEqual({ [CT]: { [FLD2]: 'b' }, [CT2]: {} })
    expect(next.entities[0]?.components[CT2]).toBe(store.initial.entities[0]?.components[CT2])
  })

  it('keeps the component after the clear of its last value', () => {
    const store = createStore({ model: workbench() })
    const next = send(store, store.initial, 'store/clear-field', clear(FLD))
    expect(next.entities[0]?.components).toEqual({ [CT]: {} })
  })

  it('clears a reference and then accepts the removal of the entity that it named', () => {
    const store = createStore({ model: typedModel({ [FLD4]: ENT2 }) })
    const refused = refusal(() => send(store, store.initial, 'store/remove-entity', { entity: ENT2 }))
    expect(refused.problems.length).toBeGreaterThan(0)
    const cleared = send(store, store.initial, 'store/clear-field', clear(FLD4))
    const removed = send(store, cleared, 'store/remove-entity', { entity: ENT2 })
    expect(removed.entities.map((entity) => entity.id)).toEqual([ENT])
  })

  it('uses the ID for the type of the input', () => {
    const store = createStore({ id: 'product', model: typedModel({ [FLD2]: 3 }) })
    const input = storeInputs('product').clearField(clear())
    const next = send(store, store.initial, input.type, input.payload)
    expect(storeInputs('product').clearField(clear()).type).toBe('product/clear-field')
    expect(next.entities[0]?.components[CT]).toEqual({})
    expect(store.inputs).toContain('product/clear-field')
  })

  it.each([
    ['a field with no value', typedModel({ [FLD]: 'x' }), clear(FLD2)],
    ['an entity with no component of the type', typedModel({}), { ...clear(), entity: ENT2 }],
  ])('returns the same part for %s and adds no component', (_name, model, payload) => {
    const store = createStore({ model })
    const next = send(store, store.initial, 'store/clear-field', payload)
    expect(next).toBe(store.initial)
    expect(store.initial.entities[1]?.components).toEqual({})
  })

  it('returns the same part for a second clear', () => {
    const store = createStore({ model: typedModel({ [FLD2]: 3 }) })
    const once = send(store, store.initial, 'store/clear-field', clear())
    expect(once).not.toBe(store.initial)
    expect(send(store, once, 'store/clear-field', clear())).toBe(once)
  })

  it('accepts a frozen part', () => {
    const store = createStore({ model: typedModel({ [FLD2]: 3 }) })
    expect(Object.isFrozen(store.initial)).toBe(true)
    expect(() => send(store, store.initial, 'store/clear-field', clear())).not.toThrow()
  })

  it('refuses an entity that does not exist, with a problem that names the ID', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() =>
      send(store, store.initial, 'store/clear-field', { entity: MISSING, componentType: CT, field: FLD }),
    )
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.message).toContain(MISSING)
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('refuses a component type that is not defined', () => {
    const store = createStore({ model: workbench() })
    const unknown = 'ct_99999999-8888-4777-8666-555555555555'
    const error = refusal(() =>
      send(store, store.initial, 'store/clear-field', { entity: ENT, componentType: unknown, field: FLD }),
    )
    expect(error.problems[0]?.message).toContain(unknown)
    expect(error.problems[0]?.path).toEqual(['payload', 'componentType'])
  })

  it('refuses a field of a different component type, also when nothing is to clear', () => {
    const store = createStore({ model: workbench() })
    const error = refusal(() =>
      send(store, store.initial, 'store/clear-field', { entity: ENT, componentType: CT, field: FLD2 }),
    )
    expect(error.problems[0]?.message).toContain(FLD2)
    expect(error.problems[0]?.path).toEqual(['payload', 'field'])
  })

  it.each([
    ['no payload', undefined, [['payload']]],
    ['a payload that is not an object', 'text', [['payload']]],
    [
      'an empty payload',
      {},
      [
        ['payload', 'entity'],
        ['payload', 'componentType'],
        ['payload', 'field'],
      ],
    ],
  ])('refuses %s', (_name, payload, paths) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/clear-field', payload))
    expect(error.problems.map((problem) => problem.path)).toEqual(paths)
  })

  it.each([
    ['entity', { entity: 1, componentType: CT, field: FLD }],
    ['componentType', { entity: ENT, componentType: null, field: FLD }],
    ['field', { entity: ENT, componentType: CT, field: [] }],
  ])('refuses a %s that is not a string, with a problem about the form', (key, payload) => {
    const store = createStore({ model: workbench() })
    const error = refusal(() => send(store, store.initial, 'store/clear-field', payload))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.path).toEqual(['payload', key])
    expect(error.problems[0]?.message).toContain(key)
  })
})

describe('add-reference', () => {
  const add = (reference: string, field = FLD5) => ({ entity: ENT, componentType: CT, field, reference })
  const cardsOf = (part: Model) => part.entities[0]?.components[CT]?.[FLD5]

  it('adds the ID at the end, and each other entity is the same object', () => {
    const store = createStore({ model: listModel([ENT2]) })
    const next = send(store, store.initial, 'store/add-reference', add(ENT3))
    expect(cardsOf(next)).toEqual([ENT2, ENT3])
    expect(next.entities[1]).toBe(store.initial.entities[1])
    expect(next.entities[2]).toBe(store.initial.entities[2])
    expect(frozenDeep(next)).toBe(true)
  })

  it('sets a list with the one ID when the component has no value', () => {
    const store = createStore({ model: listModel() })
    expect(cardsOf(send(store, store.initial, 'store/add-reference', add(ENT2)))).toEqual([ENT2])
  })

  it('sets a list with the one ID when the component omits the field', () => {
    const store = createStore({
      model: {
        ...listModel(),
        entities: listModel().entities.map((e) => (e.id === ENT ? { ...e, components: { [CT]: {} } } : e)),
      },
    })
    const next = send(store, store.initial, 'store/add-reference', add(ENT2))
    expect(cardsOf(next)).toEqual([ENT2])
  })

  it('keeps the other fields of the component', () => {
    const store = createStore({ model: typedModel({ [FLD]: 'x', [FLD2]: 3 }) })
    const next = send(store, store.initial, 'store/add-reference', add(ENT2))
    expect(next.entities[0]?.components[CT]).toEqual({ [FLD]: 'x', [FLD2]: 3, [FLD5]: [ENT2] })
  })

  it('accepts an ID that the list holds and gives the same part', () => {
    const store = createStore({ model: listModel([ENT2]) })
    expect(send(store, store.initial, 'store/add-reference', add(ENT2))).toBe(store.initial)
  })

  it('refuses a field of a different type with a problem that names the field and the type', () => {
    const store = createStore({ model: typedModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', add(ENT2, FLD)))
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.path).toEqual(['payload', 'field'])
    expect(error.problems[0]?.message).toContain('text')
    expect(error.problems[0]?.message).toContain('reference-list')
  })

  it('refuses an ID that no entity has and names the ID', () => {
    const store = createStore({ model: listModel([ENT2]) })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', add(MISSING)))
    expect(error.problems[0]?.path).toEqual(['payload', 'reference'])
    expect(error.problems[0]?.message).toContain(MISSING)
  })

  it('refuses the entity of the list when the entity does not exist', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', { ...add(ENT2), entity: MISSING }))
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('refuses a component type that is not defined', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', { ...add(ENT2), componentType: CT2 }))
    expect(error.problems[0]?.path).toEqual(['payload', 'componentType'])
  })

  it('refuses a field that the component type does not have', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', add(ENT2, FLD2)))
    expect(error.problems[0]?.path).toEqual(['payload', 'field'])
  })

  it.each([
    ['no reference key', { entity: ENT, componentType: CT, field: FLD5 }, 'reference'],
    ['a reference that is not a string', { entity: ENT, componentType: CT, field: FLD5, reference: 5 }, 'reference'],
    ['an entity that is not a string', { entity: 5, componentType: CT, field: FLD5, reference: ENT2 }, 'entity'],
    ['a field that is not a string', { entity: ENT, componentType: CT, field: 5, reference: ENT2 }, 'field'],
  ])('refuses a payload with %s', (_name, payload, key) => {
    const store = createStore({ model: listModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', payload))
    expect(error.problems.map((problem) => problem.path)).toContainEqual(['payload', key])
    expect(error.problems.map((problem) => problem.message)).toContain(`The payload has no string "${key}" key`)
  })

  it('refuses a payload that is not an object', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() => send(store, store.initial, 'store/add-reference', 'x'))
    expect(error.problems[0]?.path).toEqual(['payload'])
  })

  it('applies for a store with the ID product and not for the ID store', () => {
    const store = createStore({ id: 'product', model: listModel() })
    const input = storeInputs('product').addReference(add(ENT2))
    expect(input.type).toBe('product/add-reference')
    expect(cardsOf(send(store, store.initial, input.type, input.payload))).toEqual([ENT2])
    expect(store.inputs).toContain('product/add-reference')
    expect(() => send(store, store.initial, 'store/add-reference', add(ENT2))).toThrow(InputRefusedError)
  })
})

describe('remove-reference', () => {
  const remove = (reference: string, field = FLD5) => ({ entity: ENT, componentType: CT, field, reference })
  const cardsOf = (part: Model) => part.entities[0]?.components[CT]?.[FLD5]

  it('removes the ID and keeps the order of the others', () => {
    const store = createStore({ model: listModel([ENT2, ENT3, ENT]) })
    const next = send(store, store.initial, 'store/remove-reference', remove(ENT3))
    expect(cardsOf(next)).toEqual([ENT2, ENT])
    expect(next.entities[1]).toBe(store.initial.entities[1])
  })

  it('keeps the other fields of the component', () => {
    const store = createStore({ model: typedModel({ [FLD]: 'x', [FLD5]: [ENT2] }) })
    const next = send(store, store.initial, 'store/remove-reference', remove(ENT2))
    expect(next.entities[0]?.components[CT]).toEqual({ [FLD]: 'x', [FLD5]: [] })
  })

  it('leaves [] after the removal of the last item', () => {
    const store = createStore({ model: listModel([ENT2]) })
    expect(cardsOf(send(store, store.initial, 'store/remove-reference', remove(ENT2)))).toEqual([])
  })

  it('accepts an ID that the list does not hold and gives the same part', () => {
    const store = createStore({ model: listModel([ENT2]) })
    expect(send(store, store.initial, 'store/remove-reference', remove(ENT3))).toBe(store.initial)
  })

  it('accepts a field with no value and gives the same part', () => {
    const store = createStore({ model: listModel() })
    expect(send(store, store.initial, 'store/remove-reference', remove(ENT3))).toBe(store.initial)
  })

  it('accepts an ID that no entity has when the list does not hold it', () => {
    const store = createStore({ model: listModel([ENT2]) })
    expect(send(store, store.initial, 'store/remove-reference', remove(MISSING))).toBe(store.initial)
  })

  it('refuses a field of a different type, also when nothing is to remove', () => {
    const store = createStore({ model: typedModel() })
    const error = refusal(() => send(store, store.initial, 'store/remove-reference', remove(ENT2, FLD)))
    expect(error.problems[0]?.path).toEqual(['payload', 'field'])
    expect(error.problems[0]?.message).toContain('reference-list')
  })

  it('refuses a payload with no reference key', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() =>
      send(store, store.initial, 'store/remove-reference', { entity: ENT, componentType: CT, field: FLD5 }),
    )
    expect(error.problems[0]?.path).toEqual(['payload', 'reference'])
  })

  it('refuses an entity that does not exist', () => {
    const store = createStore({ model: listModel() })
    const error = refusal(() =>
      send(store, store.initial, 'store/remove-reference', { ...remove(ENT2), entity: MISSING }),
    )
    expect(error.problems[0]?.path).toEqual(['payload', 'entity'])
  })

  it('makes the removal of the entity possible after the removal of its reference', () => {
    const store = createStore({ model: listModel([ENT2, ENT3]) })
    const removed = send(store, store.initial, 'store/remove-reference', remove(ENT2))
    const next = send(store, removed, 'store/remove-entity', { entity: ENT2 })
    expect(next.entities.map((entity) => entity.id)).toEqual([ENT, ENT3])
    expect(cardsOf(next)).toEqual([ENT3])
  })

  it('applies for a store with the ID product', () => {
    const store = createStore({ id: 'product', model: listModel([ENT2]) })
    const input = storeInputs('product').removeReference(remove(ENT2))
    expect(input.type).toBe('product/remove-reference')
    expect(cardsOf(send(store, store.initial, input.type, input.payload))).toEqual([])
  })
})

describe('a list of references of the caller', () => {
  const cardsOf = (model: Model, index = 0): unknown => model.entities[index]?.components[CT]?.[FLD5]
  const apply = (store: ModelSubsystem<Model>, type: string, payload: unknown): Model => {
    seq += 1
    return store.apply(store.initial, { seq, source: 'test', type, payload }, { read: () => ({}) })
  }

  it('stays unfrozen after createStore, and the store model has the same IDs', () => {
    const list = [ENT2, ENT3]
    const store = createStore({ model: listModel(list) })
    expect(Object.isFrozen(list)).toBe(false)
    expect(() => list.push(ENT)).not.toThrow()
    expect(cardsOf(store.initial)).toEqual([ENT2, ENT3])
  })

  it('stays unfrozen after replace-model', () => {
    const list = [ENT2, ENT3]
    const store = createStore({ model: listModel() })
    const next = apply(store, 'store/replace-model', { model: listModel(list) })
    expect(Object.isFrozen(list)).toBe(false)
    expect(cardsOf(next)).toEqual([ENT2, ENT3])
    expect(cardsOf(next)).not.toBe(list)
  })

  it('stays unfrozen after set-field', () => {
    const list = [ENT3, ENT2]
    const store = createStore({ model: listModel() })
    const next = apply(store, 'store/set-field', { entity: ENT, componentType: CT, field: FLD5, value: list })
    expect(Object.isFrozen(list)).toBe(false)
    expect(cardsOf(next)).toEqual([ENT3, ENT2])
    expect(cardsOf(next)).not.toBe(list)
  })

  it('stays unfrozen after add-entity', () => {
    const list = [ENT2]
    const store = createStore({ model: listModel() })
    const entity: Entity = { id: 'e_cccccccc-dddd-4eee-8fff-000000000000', components: { [CT]: { [FLD5]: list } } }
    const next = apply(store, 'store/add-entity', { entity })
    expect(Object.isFrozen(list)).toBe(false)
    expect(cardsOf(next, 3)).toEqual([ENT2])
    expect(cardsOf(next, 3)).not.toBe(list)
  })

  it('add-reference and remove-reference give a new array and keep the earlier one', () => {
    const store = createStore({ model: listModel([ENT2]) })
    const before = cardsOf(store.initial)
    const added = apply(store, 'store/add-reference', { entity: ENT, componentType: CT, field: FLD5, reference: ENT3 })
    expect(cardsOf(added)).toEqual([ENT2, ENT3])
    expect(cardsOf(added)).not.toBe(before)
    expect(before).toEqual([ENT2])
    const removed = apply(store, 'store/remove-reference', {
      entity: ENT,
      componentType: CT,
      field: FLD5,
      reference: ENT2,
    })
    expect(cardsOf(removed)).toEqual([])
    expect(cardsOf(removed)).not.toBe(before)
    expect(before).toEqual([ENT2])
  })
})
