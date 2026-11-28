import { createStore, isEqual, type Entity, type Model } from '@thrashplay/wishem-core'
import { createHub, type Input } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import { productChanges } from './product-changes.js'

const CT_A = 'ct_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CT_B = 'ct_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const F_A = 'fld_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F_B = 'fld_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const E_1 = 'e_11111111-1111-4111-8111-111111111111'
const E_2 = 'e_22222222-2222-4222-8222-222222222222'
const E_3 = 'e_33333333-3333-4333-8333-333333333333'
const E_4 = 'e_44444444-4444-4444-8444-444444444444'
const CT_L = 'ct_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const F_REF = 'fld_dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const F_LIST = 'fld_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const entity = (id: string, a: string, b?: string): Entity => ({
  id,
  components: { [CT_A]: { [F_A]: a }, ...(b === undefined ? {} : { [CT_B]: { [F_B]: b } }) },
})

const base = (): Model => ({
  definitions: [
    { id: CT_A, label: 'A', fields: [{ id: F_A, label: 'a', type: 'string' }] },
    { id: CT_B, label: 'B', fields: [{ id: F_B, label: 'b', type: 'string' }] },
  ],
  entities: [entity(E_1, 'x', '1'), entity(E_2, 'y', '2')],
})

const clone = (model: Model): Model => structuredClone(model)

/** Removes one value from a component of a model. */
const drop = (model: Model, index: number, componentType: string, field: string) => {
  const { [field]: _removed, ...rest } = model.entities[index].components[componentType]
  model.entities[index].components[componentType] = rest
}

const setField = (entityId: string, componentType: string, field: string, value: string): Input => ({
  type: 'store/set-field',
  payload: { entity: entityId, componentType, field, value },
})

describe('productChanges', () => {
  it('gives no input for equal models', () => {
    expect(productChanges(base(), clone(base()))).toEqual([])
  })

  it('gives one set-field for one changed value', () => {
    const after = clone(base())
    after.entities[1].components[CT_A][F_A] = 'z'
    expect(productChanges(base(), after)).toEqual([setField(E_2, CT_A, F_A, 'z')])
  })

  it('gives no set-field for a list that is equal in a new array, and one for a changed list', () => {
    const list = (items: string[]): Model => {
      const model = clone(base())
      model.entities[0].components[CT_A][F_A] = items
      return model
    }
    const before = list([E_2, E_3])
    expect(productChanges(before, list([E_2, E_3]))).toEqual([])
    expect(productChanges(before, list([E_3, E_2]))).toEqual([
      { type: 'store/set-field', payload: { entity: E_1, componentType: CT_A, field: F_A, value: [E_3, E_2] } },
    ])
    expect(productChanges(before, list([E_2, E_3, E_1]))).toHaveLength(1)
    const mixed = list([E_2, E_3])
    mixed.entities[1].components[CT_A][F_A] = 'z'
    expect(productChanges(before, mixed)).toEqual([setField(E_2, CT_A, F_A, 'z')])
  })

  it('gives no set-field for an unchanged value of a component with a changed value', () => {
    const F_C = 'fld_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const before = base()
    before.definitions[0].fields.push({ id: F_C, label: 'c', type: 'string' })
    before.entities[0].components[CT_A][F_C] = [E_2]
    const firstChanged = clone(before)
    firstChanged.entities[0].components[CT_A][F_A] = 'z'
    firstChanged.entities[0].components[CT_A][F_C] = [E_2]
    expect(productChanges(before, firstChanged)).toEqual([setField(E_1, CT_A, F_A, 'z')])
    const lastChanged = clone(before)
    lastChanged.entities[0].components[CT_A][F_C] = [E_3]
    expect(productChanges(before, lastChanged)).toEqual([
      { type: 'store/set-field', payload: { entity: E_1, componentType: CT_A, field: F_C, value: [E_3] } },
    ])
  })

  it('gives set-field inputs in the order of the entities, the components, and the fields', () => {
    const after = clone(base())
    after.entities[0].components[CT_A][F_A] = 'p'
    after.entities[0].components[CT_B][F_B] = 'q'
    after.entities[1].components[CT_B][F_B] = 'r'
    expect(productChanges(base(), after)).toEqual([
      setField(E_1, CT_A, F_A, 'p'),
      setField(E_1, CT_B, F_B, 'q'),
      setField(E_2, CT_B, F_B, 'r'),
    ])
  })

  it('gives a set-field for a value that a component did not have', () => {
    const before = base()
    before.entities[1].components[CT_B] = {}
    expect(productChanges(before, base())).toEqual([setField(E_2, CT_B, F_B, '2')])
  })

  const replaced: [string, (model: Model) => void][] = [
    ['a changed label', (model) => (model.definitions[0].label = 'Renamed')],
    [
      'a new definition',
      (model) => {
        model.definitions.push({ id: 'ct_cccccccc-cccc-4ccc-8ccc-cccccccccccc', label: 'C', fields: [] })
      },
    ],
    [
      'a new order of the entities',
      (model) => {
        model.entities.reverse()
      },
    ],
    [
      'a new component',
      (model) => {
        model.entities[0].components = { [CT_A]: model.entities[0].components[CT_A] }
        model.entities[1].components[CT_B] = { [F_B]: '2' }
      },
    ],
  ]

  it.each(replaced)('gives one replace-model for %s', (_name, change) => {
    const after = clone(base())
    change(after)
    expect(productChanges(base(), after)).toEqual([{ type: 'store/replace-model', payload: { model: after } }])
  })

  const clearField = (entityId: string, componentType: string, field: string): Input => ({
    type: 'store/clear-field',
    payload: { entity: entityId, componentType, field },
  })

  it('gives one clear-field for one removed value', () => {
    const after = clone(base())
    drop(after, 1, CT_B, F_B)
    expect(productChanges(base(), after)).toEqual([clearField(E_2, CT_B, F_B)])
  })

  it('gives clear-field when the last value of a component is removed and the empty component stays', () => {
    const after = clone(base())
    after.entities[0].components[CT_A] = {}
    expect(productChanges(base(), after)).toEqual([clearField(E_1, CT_A, F_A)])
  })

  it('gives the set-field first and then the clear-field for a component', () => {
    const F_C = 'fld_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const before = base()
    before.definitions[0].fields.push({ id: F_C, label: 'c', type: 'string' })
    before.entities[0].components[CT_A][F_C] = 'k'
    const after = clone(before)
    drop(after, 0, CT_A, F_A)
    after.entities[0].components[CT_A][F_C] = 'm'
    expect(productChanges(before, after)).toEqual([setField(E_1, CT_A, F_C, 'm'), clearField(E_1, CT_A, F_A)])
  })

  it('gives the clear-field inputs of one component in the order of its fields', () => {
    const F_C = 'fld_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const before = base()
    before.definitions[0].fields.push({ id: F_C, label: 'c', type: 'string' })
    before.entities[0].components[CT_A][F_C] = 'k'
    const after = clone(before)
    after.entities[0].components[CT_A] = {}
    expect(productChanges(before, after)).toEqual([clearField(E_1, CT_A, F_A), clearField(E_1, CT_A, F_C)])
  })

  it('gives the inputs in the order of the entities and the components', () => {
    const after = clone(base())
    drop(after, 0, CT_B, F_B)
    drop(after, 0, CT_A, F_A)
    after.entities[1].components[CT_A][F_A] = 'w'
    expect(productChanges(base(), after)).toEqual([
      clearField(E_1, CT_A, F_A),
      clearField(E_1, CT_B, F_B),
      setField(E_2, CT_A, F_A, 'w'),
    ])
  })

  it('gives one replace-model for a removed component', () => {
    const after = clone(base())
    const { [CT_B]: _removed, ...rest } = after.entities[0].components
    after.entities[0].components = rest
    expect(productChanges(base(), after)).toEqual([{ type: 'store/replace-model', payload: { model: after } }])
  })

  it('gives one replace-model for a component type that an entity did not have', () => {
    const before = base()
    const { [CT_B]: _removed, ...rest } = before.entities[1].components
    before.entities[1].components = rest
    expect(productChanges(before, base())).toEqual([{ type: 'store/replace-model', payload: { model: base() } }])
  })

  it('gives one replace-model for a component type that replaces a type with no field', () => {
    const before = base()
    before.entities[0].components = { [CT_B]: {} }
    const after = base()
    after.entities[0].components = { [CT_A]: { [F_A]: 'x' } }
    expect(productChanges(before, after)).toEqual([{ type: 'store/replace-model', payload: { model: after } }])
  })

  it('uses the ID of the store', () => {
    const after = clone(base())
    after.entities[0].components[CT_A][F_A] = 'z'
    expect(productChanges(base(), after, 'product')[0]?.type).toBe('product/set-field')
    drop(after, 0, CT_B, F_B)
    expect(productChanges(base(), after, 'product').map((input) => input.type)).toEqual([
      'product/set-field',
      'product/clear-field',
    ])
    after.definitions[0].label = 'Renamed'
    expect(productChanges(base(), after, 'product')[0]?.type).toBe('product/replace-model')
    const added = clone(base())
    added.entities.push(entity(E_3, 'n'))
    expect(productChanges(base(), added, 'product').map((input) => input.type)).toEqual(['product/add-entity'])
    expect(productChanges(added, base(), 'product').map((input) => input.type)).toEqual(['product/remove-entity'])
  })

  it('gives inputs that change a store from the model before to the model after', async () => {
    const after = clone(base())
    after.entities[0].components[CT_A][F_A] = 'p'
    after.entities[1].components[CT_B][F_B] = 'r'
    drop(after, 0, CT_B, F_B)
    const hub = createHub({ subsystems: [createStore({ model: base() })] })
    const port = hub.attach({ id: 'tester', kind: 'input' })
    hub.start()
    for (const input of productChanges(base(), after)) {
      expect((await port.submit(input)).ok).toBe(true)
    }
    expect(isEqual(hub.read().store as Model, after)).toBe(true)
  })

  describe('added and removed entities', () => {
    interface Links {
      a?: string
      ref?: string
      list?: string[]
    }

    const linked = (id: string, { a = '', ref, list }: Links = {}): Entity => ({
      id,
      components: {
        [CT_A]: { [F_A]: a },
        [CT_L]: { ...(ref === undefined ? {} : { [F_REF]: ref }), ...(list === undefined ? {} : { [F_LIST]: list }) },
      },
    })

    const modelOf = (...entities: Entity[]): Model => ({
      definitions: [
        { id: CT_A, label: 'A', fields: [{ id: F_A, label: 'a', type: 'string' }] },
        {
          id: CT_L,
          label: 'L',
          fields: [
            { id: F_REF, label: 'ref', type: 'reference' },
            { id: F_LIST, label: 'list', type: 'reference-list' },
          ],
        },
      ],
      entities,
    })

    const [e1, e2, e3, e4] = [E_1, E_2, E_3, E_4].map((id) => linked(id))

    const add = (added: Entity, index?: number): Input => ({
      type: 'store/add-entity',
      payload: index === undefined ? { entity: added } : { entity: added, index },
    })
    const remove = (id: string): Input => ({ type: 'store/remove-entity', payload: { entity: id } })
    const set = (id: string, componentType: string, field: string, value: unknown): Input => ({
      type: 'store/set-field',
      payload: { entity: id, componentType, field, value },
    })
    const clear = (id: string, field: string): Input => ({
      type: 'store/clear-field',
      payload: { entity: id, componentType: CT_L, field },
    })
    const replace = (model: Model): Input => ({ type: 'store/replace-model', payload: { model } })

    const cases: [string, Model, Model, Input[]][] = [
      ['an entity at the end', modelOf(e1, e2), modelOf(e1, e2, e3), [add(e3)]],
      ['an entity at the start', modelOf(e1, e2), modelOf(e3, e1, e2), [add(e3, 0)]],
      ['an entity between two entities', modelOf(e1, e2), modelOf(e1, e3, e2), [add(e3, 1)]],
      ['two new entities one after the other', modelOf(e1, e2), modelOf(e1, e3, e4, e2), [add(e3, 1), add(e4, 2)]],
      ['a removed entity at the start', modelOf(e1, e2, e3), modelOf(e2, e3), [remove(E_1)]],
      ['a removed entity in the middle', modelOf(e1, e2, e3), modelOf(e1, e3), [remove(E_2)]],
      ['a removed entity at the end', modelOf(e1, e2, e3), modelOf(e1, e2), [remove(E_3)]],
      [
        'a removed entity and a new entity at its position',
        modelOf(e1, e2, e3),
        modelOf(e1, e4, e3),
        [add(e4, 1), remove(E_2)],
      ],
      [
        'an added entity, a removed entity, and a changed value',
        modelOf(linked(E_1, { a: 'x' }), e2),
        modelOf(linked(E_1, { a: 'y' }), e3),
        [add(e3, 1), set(E_1, CT_A, F_A, 'y'), remove(E_2)],
      ],
      [
        'a new entity that names an entity of the two models',
        modelOf(e1, e2),
        modelOf(e1, e2, linked(E_3, { ref: E_1 })),
        [add(linked(E_3, { ref: E_1 }))],
      ],
      [
        'an entity of the two models that names a new entity',
        modelOf(e1, e2),
        modelOf(linked(E_1, { ref: E_3 }), e2, e3),
        [add(e3), set(E_1, CT_L, F_REF, E_3)],
      ],
      [
        'two new entities that name each other',
        modelOf(e1),
        modelOf(e1, linked(E_2, { ref: E_3 }), linked(E_3, { ref: E_2 })),
        [add(e2), add(linked(E_3, { ref: E_2 })), set(E_2, CT_L, F_REF, E_3)],
      ],
      [
        'a new entity that names itself',
        modelOf(e1),
        modelOf(e1, linked(E_2, { ref: E_2 })),
        [add(linked(E_2, { ref: E_2 }))],
      ],
      [
        'two removed entities that name each other',
        modelOf(e1, linked(E_2, { ref: E_3 }), linked(E_3, { ref: E_2 })),
        modelOf(e1),
        [clear(E_2, F_REF), clear(E_3, F_REF), remove(E_2), remove(E_3)],
      ],
      [
        'a reference that moves from a removed entity to a new entity',
        modelOf(linked(E_1, { ref: E_2 }), e2),
        modelOf(linked(E_1, { ref: E_3 }), e3),
        [add(e3, 1), set(E_1, CT_L, F_REF, E_3), remove(E_2)],
      ],
      [
        'a removed entity that names an entity of the two models',
        modelOf(e1, linked(E_2, { ref: E_1 })),
        modelOf(e1),
        [remove(E_2)],
      ],
      [
        'a list of an entity of the two models that holds a removed entity',
        modelOf(linked(E_1, { list: [E_2, E_3] }), e2, e3),
        modelOf(linked(E_1, { list: [E_2] }), e2),
        [set(E_1, CT_L, F_LIST, [E_2]), remove(E_3)],
      ],
      [
        'a new entity whose list holds an entity that is added later',
        modelOf(e1),
        modelOf(e1, linked(E_2, { list: [E_3] }), e3),
        [add(e2), add(e3), set(E_2, CT_L, F_LIST, [E_3])],
      ],
      [
        'two new entities whose lists hold each other',
        modelOf(e1),
        modelOf(e1, linked(E_2, { list: [E_3] }), linked(E_3, { list: [E_2] })),
        [add(linked(E_2)), add(linked(E_3, { list: [E_2] })), set(E_2, CT_L, F_LIST, [E_3])],
      ],
      [
        'a new entity whose list holds its own ID',
        modelOf(e1),
        modelOf(e1, linked(E_2, { list: [E_2] })),
        [add(linked(E_2, { list: [E_2] }))],
      ],
      ['a removed entity that names itself', modelOf(e1, linked(E_2, { ref: E_2 })), modelOf(e1), [remove(E_2)]],
      [
        'a removed entity whose list holds its own ID',
        modelOf(e1, linked(E_2, { list: [E_2] })),
        modelOf(e1),
        [remove(E_2)],
      ],
      [
        'a changed value and a new entity that names an entity that is added later',
        modelOf(linked(E_1, { a: 'x' })),
        modelOf(linked(E_1, { a: 'y' }), linked(E_2, { ref: E_3 }), e3),
        [add(linked(E_2)), add(e3), set(E_1, CT_A, F_A, 'y'), set(E_2, CT_L, F_REF, E_3)],
      ],
      [
        'two removed entities whose lists hold each other',
        modelOf(e1, linked(E_2, { list: [E_3] }), linked(E_3, { list: [E_2] })),
        modelOf(e1),
        [clear(E_2, F_LIST), clear(E_3, F_LIST), remove(E_2), remove(E_3)],
      ],
      [
        'an equal list in a new object, with an addition',
        modelOf(linked(E_1, { list: [E_2] }), e2),
        modelOf(linked(E_1, { list: [E_2] }), e2, e3),
        [add(e3)],
      ],
    ]

    it('keeps the value of a reference field that is not an ID, and the items of a list that are not IDs', () => {
      const odd = (value: unknown, field: string): Entity => ({
        id: E_2,
        components: { [CT_A]: { [F_A]: '' }, [CT_L]: { [field]: value } as Entity['components'][string] },
      })
      expect(productChanges(modelOf(e1), modelOf(e1, odd(5, F_REF)))).toEqual([add(odd(5, F_REF))])
      expect(productChanges(modelOf(e1), modelOf(e1, odd([E_1, 5], F_LIST)))).toEqual([add(odd([E_1, 5], F_LIST))])
    })

    const replaced: [string, Model, Model][] = [
      ['a new order of the entities of the two models, with an addition', modelOf(e1, e2), modelOf(e2, e1, e3)],
      [
        'a new definition with an addition',
        modelOf(e1, e2),
        { ...modelOf(e1, e2, e3), definitions: [...modelOf().definitions, { id: CT_B, label: 'B', fields: [] }] },
      ],
      [
        'a removed component of an entity of the two models, with an addition',
        modelOf(e1, e2),
        modelOf({ id: E_1, components: { [CT_A]: { [F_A]: '' } } }, e2, e3),
      ],
    ]

    const applied = async (before: Model, inputs: Input[]): Promise<Model> => {
      const hub = createHub({ subsystems: [createStore({ model: before })] })
      const port = hub.attach({ id: 'tester', kind: 'input' })
      hub.start()
      for (const input of inputs) {
        const result = await port.submit(input)
        expect(result, JSON.stringify(input)).toMatchObject({ ok: true })
      }
      return hub.read().store as Model
    }

    it.each([
      ...cases,
      ...replaced.map(([name, before, after]): [string, Model, Model, Input[]] => [
        name,
        before,
        after,
        [replace(after)],
      ]),
    ])('gives the exact inputs for %s, and the store holds the model after', async (_name, before, after, inputs) => {
      expect(productChanges(before, after)).toEqual(inputs)
      expect(isEqual(await applied(before, productChanges(before, after)), after)).toBe(true)
    })
  })
})
