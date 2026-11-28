import type { Entity, Model } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import type { CollectedView, ViewTable } from './collect-views.js'
import { findHolds } from './hold.js'

const CT_LIST = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const CT_PLAIN = 'ct_bbbbbbbb-0000-4000-8000-000000000002'
const FLD_FIRST = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const FLD_PLAIN_NEXT = 'fld_bbbbbbbb-0000-4000-8000-000000000012'
const A = 'e_aaaaaaaa-0000-4000-8000-000000000021'
const B = 'e_aaaaaaaa-0000-4000-8000-000000000022'
const C = 'e_aaaaaaaa-0000-4000-8000-000000000023'

const entry = (sidecar: string, componentType: string): CollectedView => ({ sidecar, componentType, view: () => null })
const views = (...items: CollectedView[]): ViewTable => new Map(items.map((item) => [item.componentType, item]))
const withView = views(entry('List.view.json', CT_LIST))

/** Each entity has a `List` component that names the entity given for it, or no field. */
const model = (refs: Record<string, string | undefined>): Model => ({
  definitions: [
    { id: CT_LIST, label: 'List', fields: [{ id: FLD_FIRST, label: 'first', type: 'reference' }] },
    { id: CT_PLAIN, label: 'Plain', fields: [{ id: FLD_PLAIN_NEXT, label: 'next', type: 'reference' }] },
  ],
  entities: Object.entries(refs).map(([id, ref]): Entity => ({
    id,
    components: { [CT_LIST]: ref === undefined ? {} : { [FLD_FIRST]: ref } },
  })),
})

describe('findHolds', () => {
  it('holds the entity that a reference of a component with a view names', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: B, [B]: undefined }))
    expect([...held]).toEqual([B])
    expect(cycles).toEqual([])
  })

  it('holds no entity for a reference in a component type with no view', () => {
    const plain: Model = {
      ...model({ [A]: undefined, [B]: undefined }),
      entities: [
        { id: A, components: { [CT_PLAIN]: { [FLD_PLAIN_NEXT]: B } } },
        { id: B, components: { [CT_LIST]: {} } },
      ],
    }
    expect([...findHolds(withView, plain).held]).toEqual([])
  })

  it('holds no entity for a model with no references', () => {
    expect([...findHolds(withView, model({ [A]: undefined, [B]: undefined })).held]).toEqual([])
  })

  it('gives a cycle and no held entity for an entity that names itself', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: A }))
    expect([...held]).toEqual([])
    expect(cycles).toEqual([
      { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_FIRST, holder: A, entity: A },
    ])
  })

  it('holds an entity once for two holders', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: C, [B]: C, [C]: undefined }))
    expect([...held]).toEqual([C])
    expect(cycles).toEqual([])
  })

  it('gives the reference that closes a cycle under a root', () => {
    const { held, cycles } = findHolds(withView, model({ [C]: A, [A]: B, [B]: A }))
    expect([...held].sort()).toEqual([A, B])
    expect(cycles).toEqual([
      { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_FIRST, holder: B, entity: A },
    ])
  })

  it('gives one cycle for two entities that hold each other with no root', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: B, [B]: A }))
    expect([...held].sort()).toEqual([A, B])
    expect(cycles).toEqual([
      { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_FIRST, holder: B, entity: A },
    ])
  })

  it('ignores a reference to an entity that the model does not have', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: B }))
    expect([...held]).toEqual([])
    expect(cycles).toEqual([])
  })
})
