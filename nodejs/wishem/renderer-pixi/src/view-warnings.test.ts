import { describe, expect, it } from 'vitest'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import type { PixiView, ViewTable } from './types.js'
import { describeWarning, viewWarnings } from './view-warnings.js'

const TYPE_A = 'ct_00000000-0000-4000-8000-00000000000a'
const TYPE_B = 'ct_00000000-0000-4000-8000-00000000000b'

const view: PixiView = { create: () => ({}) as never, update: () => undefined }

const definition = (id: string, ...labels: string[]): ComponentTypeDefinition => ({
  id,
  label: 'Thing',
  fields: labels.map((label, index) => ({ id: `fld_${String(index)}`, label, type: 'string' })),
})

const tableOf = (...entries: [sidecar: string, componentType: string][]): ViewTable =>
  new Map(entries.map(([sidecar, componentType]) => [componentType, { sidecar, componentType, view }]))

describe('viewWarnings', () => {
  it('gives one warning with the field ID for a label that gives an empty name', () => {
    const warnings = viewWarnings(tableOf(['A.view.json', TYPE_A]), [definition(TYPE_A, 'title', '???')])
    expect(warnings).toEqual([{ kind: 'empty-name', sidecar: 'A.view.json', componentType: TYPE_A, fields: ['fld_1'] }])
  })

  it('gives one warning for each empty name, in the order of the fields', () => {
    const warnings = viewWarnings(tableOf(['A.view.json', TYPE_A]), [definition(TYPE_A, '???', 'ok', '!!!')])
    expect(warnings.map((warning) => warning.fields)).toEqual([['fld_0'], ['fld_2']])
  })

  it('gives no warning for a name that starts with a digit, or for two labels with one name', () => {
    const warnings = viewWarnings(tableOf(['A.view.json', TYPE_A]), [
      definition(TYPE_A, '2nd line', 'Max health', 'max-health'),
    ])
    expect(warnings).toEqual([])
  })

  it('gives no warning for a view whose component type has no definition', () => {
    expect(viewWarnings(tableOf(['A.view.json', TYPE_A]), [definition(TYPE_B, '???')])).toEqual([])
  })

  it('gives the warnings of a later view after a view with no definition', () => {
    const table = new Map([
      [TYPE_A, { sidecar: 'A.view.json', componentType: TYPE_A, view }],
      [TYPE_B, { sidecar: 'B.view.json', componentType: TYPE_B, view }],
    ])
    const warnings = viewWarnings(table, [definition(TYPE_B, '???')])
    expect(warnings.map((warning) => warning.componentType)).toEqual([TYPE_B])
  })

  it('sorts three warnings that the table gives in each order', () => {
    const TYPE_C = 'ct_00000000-0000-4000-8000-00000000000c'
    const entries: [string, string][] = [
      ['A.view.json', TYPE_A],
      ['B.view.json', TYPE_B],
      ['C.view.json', TYPE_C],
    ]
    const definitions = [definition(TYPE_A, '???'), definition(TYPE_B, '???'), definition(TYPE_C, '???')]
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]
    for (const order of orders) {
      const warnings = viewWarnings(tableOf(...order.map((index) => entries[index])), definitions)
      expect(warnings.map((warning) => warning.sidecar)).toEqual(['A.view.json', 'B.view.json', 'C.view.json'])
    }
  })

  it('sorts the warnings by sidecar and component type', () => {
    const table = new Map([
      [TYPE_A, { sidecar: 'B.view.json', componentType: TYPE_A, view }],
      [TYPE_B, { sidecar: 'A.view.json', componentType: TYPE_B, view }],
    ])
    const warnings = viewWarnings(table, [definition(TYPE_A, '???'), definition(TYPE_B, '???')])
    expect(warnings.map((warning) => [warning.sidecar, warning.componentType])).toEqual([
      ['A.view.json', TYPE_B],
      ['B.view.json', TYPE_A],
    ])
  })

  it('sorts the warnings of one sidecar by component type', () => {
    const table = new Map([
      [TYPE_B, { sidecar: 'A.view.json', componentType: TYPE_B, view }],
      [TYPE_A, { sidecar: 'A.view.json', componentType: TYPE_A, view }],
    ])
    const warnings = viewWarnings(table, [definition(TYPE_A, '???'), definition(TYPE_B, '???')])
    expect(warnings.map((warning) => warning.componentType)).toEqual([TYPE_A, TYPE_B])
  })
})

describe('describeWarning', () => {
  it('gives the line for an empty name', () => {
    expect(
      describeWarning({ kind: 'empty-name', sidecar: 'A.view.json', componentType: TYPE_A, fields: ['fld_1'] }),
    ).toBe(
      `wishem: the sidecar A.view.json: the label of the field fld_1 of the component type ${TYPE_A} gives an empty name. The view does not get the field.`,
    )
  })
})
