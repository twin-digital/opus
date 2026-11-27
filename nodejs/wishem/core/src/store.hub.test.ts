import { createHub } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import type { Model } from './model.js'
import { createStore, storeInputs } from './store.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const ENT2 = 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const model: Model = {
  definitions: [{ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: ENT, components: { [CT]: { [FLD]: 'Wishem' } } }],
}

const start = (options: { id?: string } = {}) => {
  const hub = createHub({ subsystems: [createStore({ ...options, model })] })
  const form = hub.attach({ id: 'form', kind: 'input' })
  hub.start()
  return { hub, form }
}

describe('a store in a hub', () => {
  it('puts the model of the store in the joined state under the key store', () => {
    const { hub } = start()
    const part = hub.read().store as Model
    expect(part.definitions[0]?.label).toBe('AppBar')
    expect(part.entities[0]?.id).toBe(ENT)
  })

  it('puts a store with a different ID under that ID and applies only its input types', async () => {
    const { hub, form } = start({ id: 'product' })
    const own = await form.submit(
      storeInputs('product').setField({ entity: ENT, componentType: CT, field: FLD, value: 'Product' }),
    )
    const other = await form.submit(
      storeInputs().setField({ entity: ENT, componentType: CT, field: FLD, value: 'Other' }),
    )
    expect(own).toEqual({ ok: true, seq: 1 })
    expect(other).toMatchObject({ ok: false, reason: 'unknown-type' })
    expect(hub.read()).toHaveProperty('product')
    expect(hub.read()).not.toHaveProperty('store')
  })

  it('refuses a payload with no entity and keeps the part and the record', async () => {
    const { hub, form } = start()
    const before = hub.read().store
    const result = await form.submit({ type: 'store/add-entity', payload: {} })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(result.ok ? [] : result.problems.length).toBeGreaterThan(0)
    expect(hub.read().store).toBe(before)
    expect(hub.record()).toEqual([])
  })

  it('refuses a model with two component types that have one ID and keeps the model', async () => {
    const { hub, form } = start()
    const before = hub.read().store
    const duplicate = { definitions: [...model.definitions, ...model.definitions], entities: [] }
    const result = await form.submit({ type: 'store/replace-model', payload: { model: duplicate } })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : (result.problems[0]?.message ?? '')).toContain(CT)
    expect(hub.read().store).toBe(before)
    expect(hub.record()).toHaveLength(0)
  })

  it('keeps the same part object after an input that changes nothing', async () => {
    const { hub, form } = start()
    const before = hub.read().store
    const result = await form.submit(storeInputs().replaceModel(model))
    expect(result).toEqual({ ok: true, seq: 1 })
    expect(hub.read().store).toBe(before)
  })

  it('keeps the earlier part and the unchanged entity after a change', async () => {
    const second = { id: ENT2, components: {} }
    const hub = createHub({
      subsystems: [createStore({ model: { ...model, entities: [...model.entities, second] } })],
    })
    const form = hub.attach({ id: 'form', kind: 'input' })
    hub.start()
    const before = hub.read().store as Model
    await form.submit(storeInputs().setField({ entity: ENT, componentType: CT, field: FLD, value: 'New' }))
    const after = hub.read().store as Model
    expect(before.entities[0]?.components[CT]?.[FLD]).toBe('Wishem')
    expect(after.entities[0]?.components[CT]?.[FLD]).toBe('New')
    expect(after.entities[1]).toBe(before.entities[1])
  })
})

describe('the record of a hub', () => {
  it('gives the same model in a second hub that gets the inputs in order', async () => {
    const first = start()
    const inputs = storeInputs()
    await first.form.submit(inputs.addEntity({ id: ENT2, components: {} }))
    await first.form.submit(inputs.setField({ entity: ENT2, componentType: CT, field: FLD, value: 'Second' }))
    await first.form.submit(inputs.removeEntity(ENT))
    await first.form.submit(inputs.removeEntity(ENT))

    const second = start()
    for (const recorded of first.hub.record()) {
      await second.form.submit({ type: recorded.type, payload: recorded.payload })
    }
    expect(first.hub.record()).toHaveLength(3)
    expect(second.hub.read().store).toEqual(first.hub.read().store)
    expect((second.hub.read().store as Model).entities.map((entity) => entity.id)).toEqual([ENT2])
  })
})

describe('the example of the README', () => {
  it('sets a field and refuses the removal of an entity that does not exist', async () => {
    const hub = createHub({ subsystems: [createStore({ model })] })
    const form = hub.attach({ id: 'form', kind: 'input' })
    hub.start()

    const result = await form.submit(
      storeInputs().setField({
        entity: 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2',
        componentType: 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34',
        field: 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62',
        value: 'Wishem workbench',
      }),
    )
    // { ok: true, seq: 1 }

    const refused = await form.submit(storeInputs().removeEntity('e_00000000-0000-4000-8000-000000000000'))
    // { ok: false, reason: 'invalid', problems: [{ message: 'No entity has the ID "e_00000000-0000-4000-8000-000000000000"', path: ['payload', 'entity'] }] }

    expect(result).toEqual({ ok: true, seq: 1 })
    expect(refused).toEqual({
      ok: false,
      reason: 'invalid',
      problems: [
        { message: 'No entity has the ID "e_00000000-0000-4000-8000-000000000000"', path: ['payload', 'entity'] },
      ],
    })
  })
})
