import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { describe, expect, it } from 'vitest'
import type { CollectedView, ViewTable } from './collect-views.js'
import { checkViews, describeDifference } from './check-views.js'
import { defineView } from './define-view.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const SUBTITLE = 'fld_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const appBarDefinition: ComponentTypeDefinition = {
  id: APP_BAR,
  label: 'AppBar',
  fields: [{ id: TITLE, label: 'title', type: 'string' }],
}

const collected = (file: string, componentType: string, fields: Record<string, string> = {}): CollectedView => ({
  file,
  view: defineView({
    componentType,
    props: Object.fromEntries(
      Object.entries(fields).map(([prop, field]) => [prop, { field, type: 'string' as const }]),
    ),
    render: () => null,
  }),
})

const tableOf = (...entries: CollectedView[]): ViewTable =>
  new Map(entries.map((entry) => [entry.view.componentType, entry]))

describe('checkViews', () => {
  it('gives no difference for a view that agrees with its definition', () => {
    const views = tableOf(collected('AppBar.tsx', APP_BAR, { title: TITLE }))

    expect(checkViews(views, [appBarDefinition])).toEqual([])
  })

  it('gives no difference for a field that the view does not declare', () => {
    const views = tableOf(collected('AppBar.tsx', APP_BAR))

    expect(checkViews(views, [appBarDefinition])).toEqual([])
  })

  it('gives no difference for no views', () => {
    expect(checkViews(new Map(), [appBarDefinition])).toEqual([])
  })

  it('reports a component type that is not defined', () => {
    const views = tableOf(collected('AppBar.tsx', APP_BAR, { title: TITLE }))

    expect(checkViews(views, [])).toEqual([
      { kind: 'component-type-not-defined', file: 'AppBar.tsx', componentType: APP_BAR },
    ])
  })

  it('reports a field that the component type does not have', () => {
    const views = tableOf(collected('AppBar.tsx', APP_BAR, { subtitle: SUBTITLE }))

    expect(checkViews(views, [appBarDefinition])).toEqual([
      { kind: 'field-not-defined', file: 'AppBar.tsx', componentType: APP_BAR, field: SUBTITLE, prop: 'subtitle' },
    ])
  })

  it('reports a field with a different type', () => {
    const views = tableOf(collected('AppBar.tsx', APP_BAR, { title: TITLE }))
    const definition = {
      ...appBarDefinition,
      fields: [{ id: TITLE, label: 'title', type: 'number' }],
    } as unknown as ComponentTypeDefinition

    expect(checkViews(views, [definition])).toEqual([
      { kind: 'field-type-different', file: 'AppBar.tsx', componentType: APP_BAR, field: TITLE, prop: 'title' },
    ])
  })

  it('gives the same order for equal input in any insertion order', () => {
    const a = collected('A.tsx', 'ct_a', { one: SUBTITLE })
    const b = collected('B.tsx', 'ct_b', { one: SUBTITLE })
    const c = collected('C.tsx', APP_BAR, { zed: 'fld_z', alpha: 'fld_a' })

    const first = checkViews(tableOf(c, b, a), [appBarDefinition])
    const second = checkViews(tableOf(a, b, c), [appBarDefinition])

    expect(first).toEqual(second)
    expect(first.map((difference) => difference.file)).toEqual(['A.tsx', 'B.tsx', 'C.tsx', 'C.tsx'])
    expect(first.map((difference) => difference.field)).toEqual([undefined, undefined, 'fld_a', 'fld_z'])
  })
})

describe('describeDifference', () => {
  it('names the file and the ID for a component type that is not defined', () => {
    expect(describeDifference({ kind: 'component-type-not-defined', file: 'AppBar.tsx', componentType: APP_BAR })).toBe(
      `wishem: the view AppBar.tsx declares the component type ${APP_BAR}, which no definition has. No view is drawn for it.`,
    )
  })

  it('names the file, the component type, the field, and the prop for a field that is not defined', () => {
    expect(
      describeDifference({
        kind: 'field-not-defined',
        file: 'AppBar.tsx',
        componentType: APP_BAR,
        field: TITLE,
        prop: 'title',
      }),
    ).toBe(
      `wishem: the view AppBar.tsx declares the field ${TITLE} (prop "title"), which the component type ${APP_BAR} does not have. The prop has no value.`,
    )
  })

  it('names the file, the component type, the field, and the prop for a field with a different type', () => {
    const message = describeDifference({
      kind: 'field-type-different',
      file: 'AppBar.tsx',
      componentType: APP_BAR,
      field: TITLE,
      prop: 'title',
    })

    expect(message).toBe(
      `wishem: the view AppBar.tsx declares the field ${TITLE} (prop "title") with a type that the component type ${APP_BAR} does not give to it.`,
    )
  })
})
