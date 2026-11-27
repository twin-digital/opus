import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import type { CollectedView, ViewTable } from './collect-views.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

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

  it('gives no warning for an empty name or a name that starts with a digit', () => {
    const views = tableOf(entry('AppBar.view.json', APP_BAR))

    expect(viewWarnings(views, [definition(APP_BAR, '---', '1st')])).toEqual([])
  })

  it('sorts the result by sidecar, so that the order is stable', () => {
    const forward = tableOf(entry('AppBar.view.json', APP_BAR), entry('Header.view.json', HEADER))
    const backward = tableOf(entry('Header.view.json', HEADER), entry('AppBar.view.json', APP_BAR))
    const definitions = [definition(APP_BAR, 'a', 'A'), definition(HEADER, 'b', 'B')]

    const result = viewWarnings(forward, definitions)

    expect(result.map((warning) => warning.sidecar)).toEqual(['AppBar.view.json', 'Header.view.json'])
    expect(viewWarnings(backward, definitions)).toEqual(result)
  })
})

describe('describeWarning', () => {
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
