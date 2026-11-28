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
      'a new entity',
      (model) => {
        model.entities.push(entity(E_3, 'n'))
      },
    ],
    [
      'a removed entity',
      (model) => {
        model.entities.pop()
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

  it('uses the ID of the store', () => {
    const after = clone(base())
    after.entities[0].components[CT_A][F_A] = 'z'
    expect(productChanges(base(), after, 'product')[0]?.type).toBe('product/set-field')
    after.entities.pop()
    expect(productChanges(base(), after, 'product')[0]?.type).toBe('product/replace-model')
  })

  it('gives inputs that change a store from the model before to the model after', async () => {
    const after = clone(base())
    after.entities[0].components[CT_A][F_A] = 'p'
    after.entities[1].components[CT_B][F_B] = 'r'
    const hub = createHub({ subsystems: [createStore({ model: base() })] })
    const port = hub.attach({ id: 'tester', kind: 'input' })
    hub.start()
    for (const input of productChanges(base(), after)) {
      expect((await port.submit(input)).ok).toBe(true)
    }
    expect(isEqual(hub.read().store as Model, after)).toBe(true)
  })
})
