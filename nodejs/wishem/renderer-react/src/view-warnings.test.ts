import type { ComponentTypeDefinition, Model } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import type { CollectedView, ViewTable } from './collect-views.js'
import { describeWarning, holdWarnings, viewWarnings } from './view-warnings.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const HEADER = 'ct_9d1e5b72-4c08-4a3f-8e26-7b1d0c9a5e43'
const FIELD_A = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FIELD_B = 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03'

const definition = (id: string, ...labels: string[]): ComponentTypeDefinition => ({
  id,
  label: 'Type',
  fields: labels.map((label, index) => ({ id: index === 0 ? FIELD_A : FIELD_B, label, type: 'string' })),
})

const entry = (sidecar: string, componentType: string): CollectedView => ({
  sidecar,
  componentType,
  view: () => null,
})

const tableOf = (...entries: CollectedView[]): ViewTable => new Map(entries.map((item) => [item.componentType, item]))

describe('viewWarnings', () => {
  it('gives no warning for a view that agrees with its definition', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, 'title')])).toEqual([])
  })

  it('gives no warning for no views', () => {
    expect(viewWarnings(new Map(), [definition(APP_BAR, 'title')])).toEqual([])
  })

  it('gives one warning for a component type that has no definition', () => {
    const views = tableOf(entry('Header.view.json', HEADER))

    expect(viewWarnings(views, [definition(APP_BAR, 'title')])).toEqual([
      { kind: 'component-type-not-defined', sidecar: 'Header.view.json', componentType: HEADER },
    ])
  })

  it('gives one warning with the two field IDs for two labels that give one name', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, 'Max health', 'max-health')])).toEqual([
      {
        kind: 'same-name',
        sidecar: 'AppBar.view.json',
        componentType: APP_BAR,
        name: 'maxHealth',
        fields: [FIELD_A, FIELD_B],
      },
    ])
  })

  it('gives one warning with the field ID and the name for a label that gives a reserved name', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, 'title', 'Wishem')])).toEqual([
      {
        kind: 'reserved-name',
        sidecar: 'AppBar.view.json',
        componentType: APP_BAR,
        name: 'wishem',
        fields: [FIELD_B],
      },
    ])
  })

  it('gives one warning with the field ID for a label that gives an empty name', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, 'title', '---')])).toEqual([
      { kind: 'empty-name', sidecar: 'AppBar.view.json', componentType: APP_BAR, fields: [FIELD_B] },
    ])
  })

  it('gives one warning for each of two empty names, and no same-name warning', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))
    const result = viewWarnings(views, [definition(APP_BAR, '???', '---')])

    expect(result.map((warning) => warning.kind)).toEqual(['empty-name', 'empty-name'])
  })

  it('gives no warning for a name that starts with a digit', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, '1st')])).toEqual([])
  })

  it('sorts the result by sidecar, so that the order is stable', () => {
    const forward = tableOf(entry('AppBar.view.json', APP_BAR), entry('Header.view.json', HEADER))
    const backward = tableOf(entry('Header.view.json', HEADER), entry('AppBar.view.json', APP_BAR))
    const definitions = [definition(APP_BAR, 'a', 'A'), definition(HEADER, 'b', 'B')]

    const result = viewWarnings(forward, definitions)

    expect(result.map((warning) => warning.sidecar)).toEqual(['AppBar.view.json', 'Header.view.json'])
    expect(viewWarnings(backward, definitions)).toEqual(result)
  })

  it('sorts the result by sidecar before the component type', () => {
    const views = tableOf(entry('B.view.json', APP_BAR), entry('A.view.json', HEADER))

    expect(viewWarnings(views, []).map((warning) => warning.sidecar)).toEqual(['A.view.json', 'B.view.json'])
  })

  it('sorts the warnings of one sidecar name by component type', () => {
    const views = tableOf(entry('Same.view.json', HEADER), entry('Same.view.json', APP_BAR))

    expect(viewWarnings(views, []).map((warning) => warning.componentType)).toEqual([APP_BAR, HEADER])
  })

  it('sorts a warning with no name before the warnings with a name', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    const result = viewWarnings(views, [definition(APP_BAR, 'b', 'B', '---')])

    expect(result.map((warning) => warning.kind)).toEqual(['empty-name', 'same-name'])
  })

  it('sorts the warnings of one sidecar by name', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    const result = viewWarnings(views, [definition(APP_BAR, 'b', 'B', 'a', 'A')])

    expect(result.map((warning) => warning.name)).toEqual(['a', 'b'])
  })
})

const LIST = 'ct_5a6b7c8d-1e2f-4a3b-8c4d-9e0f1a2b3c4d'
const FIELD_FIRST = 'fld_7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f'
const E_A = 'e_11111111-0000-4000-8000-000000000001'
const E_B = 'e_11111111-0000-4000-8000-000000000002'

const listModel = (refs: Record<string, string>): Model => ({
  definitions: [{ id: LIST, label: 'List', fields: [{ id: FIELD_FIRST, label: 'first', type: 'reference' }] }],
  entities: Object.entries(refs).map(([id, ref]) => ({ id, components: { [LIST]: { [FIELD_FIRST]: ref } } })),
})

describe('holdWarnings', () => {
  const views = tableOf(entry('List.view.json', LIST))

  it('gives no warning for references with no cycle', () => {
    expect(holdWarnings(views, listModel({ [E_A]: E_B }))).toEqual([])
  })

  it('gives one warning with the entities and the field for a cycle', () => {
    expect(holdWarnings(views, listModel({ [E_A]: E_B, [E_B]: E_A }))).toEqual([
      {
        kind: 'reference-cycle',
        sidecar: 'List.view.json',
        componentType: LIST,
        fields: [FIELD_FIRST],
        entities: [E_B, E_A],
      },
    ])
  })

  it('gives one warning for an entity that names itself', () => {
    expect(holdWarnings(views, listModel({ [E_A]: E_A }))).toEqual([
      {
        kind: 'reference-cycle',
        sidecar: 'List.view.json',
        componentType: LIST,
        fields: [FIELD_FIRST],
        entities: [E_A, E_A],
      },
    ])
  })

  it('sorts the warnings by sidecar', () => {
    const OTHER = 'ct_2b3c4d5e-6f70-4a81-9b92-a3b4c5d6e7f8'
    const FIELD_NEXT = 'fld_3d4e5f60-7182-4a93-8ba4-b5c6d7e8f901'
    const model: Model = {
      definitions: [
        { id: LIST, label: 'List', fields: [{ id: FIELD_FIRST, label: 'first', type: 'reference' }] },
        { id: OTHER, label: 'Other', fields: [{ id: FIELD_NEXT, label: 'next', type: 'reference' }] },
      ],
      entities: [
        { id: E_A, components: { [LIST]: { [FIELD_FIRST]: E_A } } },
        { id: E_B, components: { [OTHER]: { [FIELD_NEXT]: E_B } } },
      ],
    }
    const both = tableOf(entry('List.view.json', LIST), entry('A.view.json', OTHER))

    expect(holdWarnings(both, model).map((warning) => warning.sidecar)).toEqual(['A.view.json', 'List.view.json'])
  })

  it('gives no warning after the cycle is corrected', () => {
    expect(holdWarnings(views, listModel({ [E_A]: E_B, [E_B]: E_B.replace('2', '3') }))).toEqual([])
  })
})

describe('describeWarning', () => {
  it('names the sidecar file, the entities, the field, and the component type for a cycle', () => {
    expect(
      describeWarning({
        kind: 'reference-cycle',
        sidecar: 'List.view.json',
        componentType: LIST,
        fields: [FIELD_FIRST],
        entities: [E_B, E_A],
      }),
    ).toBe(
      `wishem: the sidecar List.view.json: the field ${FIELD_FIRST} of the component type ${LIST} of the entity ${E_B} names the entity ${E_A}, which is already on the path of its picture. The view gets no picture for it.`,
    )
  })

  it('names the sidecar file, the field, the component type, and the name for a reserved name', () => {
    expect(
      describeWarning({
        kind: 'reserved-name',
        sidecar: 'AppBar.view.json',
        componentType: APP_BAR,
        name: 'wishem',
        fields: [FIELD_B],
      }),
    ).toBe(
      `wishem: the sidecar AppBar.view.json: the label of the field ${FIELD_B} of the component type ${APP_BAR} gives the reserved name "wishem". The view does not get the field.`,
    )
  })

  it('names the sidecar file, the field, and the component type for an empty name', () => {
    expect(
      describeWarning({ kind: 'empty-name', sidecar: 'AppBar.view.json', componentType: APP_BAR, fields: [FIELD_B] }),
    ).toBe(
      `wishem: the sidecar AppBar.view.json: the label of the field ${FIELD_B} of the component type ${APP_BAR} gives an empty name. The view does not get the field.`,
    )
  })

  it('names the sidecar file and the ID for a component type that is not defined', () => {
    expect(
      describeWarning({ kind: 'component-type-not-defined', sidecar: 'Header.view.json', componentType: HEADER }),
    ).toBe(
      `wishem: the sidecar Header.view.json names the component type ${HEADER}, which no definition has. No view is drawn for it.`,
    )
  })

  it('names the sidecar file, the component type, and the two field IDs for the same name', () => {
    expect(
      describeWarning({
        kind: 'same-name',
        sidecar: 'AppBar.view.json',
        componentType: APP_BAR,
        name: 'maxHealth',
        fields: [FIELD_A, FIELD_B],
      }),
    ).toBe(
      `wishem: the sidecar AppBar.view.json: the fields ${FIELD_A} and ${FIELD_B} of the component type ${APP_BAR} give the same name "maxHealth". The prop has the value of the first field.`,
    )
  })
})
