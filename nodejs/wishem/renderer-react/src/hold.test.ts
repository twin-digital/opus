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

  it('holds no entity for a field that is not a reference and has the ID of an entity', () => {
    const text: Model = {
      definitions: [{ id: CT_LIST, label: 'List', fields: [{ id: FLD_FIRST, label: 'first', type: 'string' }] }],
      entities: [
        { id: A, components: { [CT_LIST]: { [FLD_FIRST]: B } } },
        { id: B, components: { [CT_LIST]: {} } },
      ],
    }
    expect([...findHolds(withView, text).held]).toEqual([])
  })

  it('gives one cycle when two paths reach the same cycle', () => {
    const FLD_SECOND = 'fld_aaaaaaaa-0000-4000-8000-000000000013'
    const D = 'e_aaaaaaaa-0000-4000-8000-000000000024'
    const refs = (first: string, second?: string) => ({
      [CT_LIST]: { [FLD_FIRST]: first, ...(second === undefined ? {} : { [FLD_SECOND]: second }) },
    })
    const diamond: Model = {
      definitions: [
        {
          id: CT_LIST,
          label: 'List',
          fields: [
            { id: FLD_FIRST, label: 'first', type: 'reference' },
            { id: FLD_SECOND, label: 'second', type: 'reference' },
          ],
        },
      ],
      entities: [
        { id: A, components: refs(B, C) },
        { id: B, components: refs(D) },
        { id: C, components: refs(D) },
        { id: D, components: refs(B) },
      ],
    }

    expect(findHolds(withView, diamond).cycles).toEqual([
      { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_FIRST, holder: D, entity: B },
    ])
  })

  it('starts at an entity that is not held, also when it comes after the cycle in the model', () => {
    const { cycles } = findHolds(withView, model({ [B]: A, [A]: B, [C]: A }))
    expect(cycles).toEqual([
      { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_FIRST, holder: B, entity: A },
    ])
  })

  it('gives the cycles in the order of the entities', () => {
    const { cycles } = findHolds(withView, model({ [A]: A, [B]: B }))
    expect(cycles.map((cycle) => cycle.holder)).toEqual([A, B])
  })

  it('ignores a reference to an entity that the model does not have', () => {
    const { held, cycles } = findHolds(withView, model({ [A]: B }))
    expect([...held]).toEqual([])
    expect(cycles).toEqual([])
  })

  describe('a reference-list field', () => {
    const FLD_CARDS = 'fld_aaaaaaaa-0000-4000-8000-000000000031'
    const deck = (cards: string[] | undefined, componentType = CT_LIST): Model => ({
      definitions: [
        { id: componentType, label: 'Deck', fields: [{ id: FLD_CARDS, label: 'cards', type: 'reference-list' }] },
      ],
      entities: [
        { id: A, components: { [componentType]: cards === undefined ? {} : { [FLD_CARDS]: cards } } },
        { id: B, components: {} },
        { id: C, components: {} },
      ],
    })

    it('holds each item of a list', () => {
      const { held, cycles } = findHolds(withView, deck([B, C]))
      expect([...held].sort()).toEqual([B, C])
      expect(cycles).toEqual([])
    })

    it('holds nothing for an empty list or an omitted field', () => {
      expect([...findHolds(withView, deck([])).held]).toEqual([])
      expect([...findHolds(withView, deck(undefined)).held]).toEqual([])
    })

    it('gives a cycle, and no hold of the holder, for a list that names its holder', () => {
      const { held, cycles } = findHolds(withView, deck([B, A]))
      expect([...held]).toEqual([B])
      expect(cycles).toEqual([
        { sidecar: 'List.view.json', componentType: CT_LIST, field: FLD_CARDS, holder: A, entity: A },
      ])
    })

    it('holds nothing for a list in a component type with no view', () => {
      expect([...findHolds(withView, deck([B, C], CT_PLAIN)).held]).toEqual([])
    })
  })
})
