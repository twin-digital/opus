import { createCore, type Core, type Snapshot } from '@thrashplay/wishem-core'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectViews } from './collect-views.js'
import { defineView } from './define-view.js'
import { Renderer } from './Renderer.js'

const CT_A = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const CT_B = 'ct_bbbbbbbb-0000-4000-8000-000000000002'
const FLD_TITLE = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const FLD_OTHER = 'fld_aaaaaaaa-0000-4000-8000-000000000012'
const E1 = 'e_aaaaaaaa-0000-4000-8000-000000000021'
const E2 = 'e_aaaaaaaa-0000-4000-8000-000000000022'

const baseModel = (titleOne: string | null = 'One'): Snapshot => ({
  definitions: [
    { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'title', type: 'string' }] },
    { id: CT_B, label: 'B', fields: [{ id: FLD_OTHER, label: 'other', type: 'string' }] },
  ],
  entities: [
    { id: E1, components: { [CT_A]: titleOne === null ? {} : { [FLD_TITLE]: titleOne } } },
    { id: E2, components: { [CT_A]: { [FLD_TITLE]: 'Two' }, [CT_B]: { [FLD_OTHER]: 'x' } } },
  ],
})

const viewA = defineView({
  componentType: CT_A,
  props: { title: { field: FLD_TITLE, type: 'string' } },
  render: ({ title }) => <span className='a'>{title === undefined ? 'none' : `title:${title}`}</span>,
})

const tableOf = (...views: { name: string; view: unknown }[]) =>
  collectViews(Object.fromEntries(views.map(({ name, view }) => [`./views/${name}`, { default: view }])))

describe('Renderer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  const draw = (core: Core, views = tableOf({ name: 'A.tsx', view: viewA })) => {
    act(() => {
      root.render(<Renderer core={core} views={views} />)
    })
  }

  const wrappers = () => Array.from(container.querySelectorAll<HTMLElement>('[data-wishem-entity]'))

  it('draws one wrapper for each component that has a view, with the two attributes', () => {
    draw(createCore(baseModel()))
    const found = wrappers()
    expect(found).toHaveLength(2)
    expect(found[0]?.dataset.wishemComponentType).toBe(CT_A)
    expect(found[0]?.style.display).toBe('contents')
  })

  it('draws in the order of the entities of the snapshot', () => {
    draw(createCore(baseModel()))
    expect(wrappers().map((wrapper) => wrapper.dataset.wishemEntity)).toEqual([E1, E2])
    expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['title:One', 'title:Two'])
  })

  it('gives a view no value for a field that the component omits', () => {
    draw(createCore(baseModel(null)))
    expect(wrappers()[0]?.textContent).toBe('none')
  })

  it('draws nothing for a component type that has no view', () => {
    const core = createCore(baseModel())
    draw(core)
    expect(container.querySelectorAll(`[data-wishem-component-type="${CT_B}"]`)).toHaveLength(0)
  })

  it('draws the new snapshot after the core sends it', () => {
    const core = createCore(baseModel('One'))
    draw(core)
    act(() => {
      core.setModel(baseModel('Changed'))
    })
    expect(wrappers()[0]?.textContent).toBe('title:Changed')
  })

  it('writes the warnings when the set of differences changes, and not again for the same set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const missing = defineView({
      componentType: 'ct_cccccccc-0000-4000-8000-000000000003',
      props: {},
      render: () => null,
    })
    const core = createCore(baseModel('One'))
    draw(core, tableOf({ name: 'A.tsx', view: viewA }, { name: 'Missing.tsx', view: missing }))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('Missing.tsx')
    act(() => {
      core.setModel(baseModel('Two'))
    })
    expect(warn).toHaveBeenCalledTimes(1)
    // A new difference changes the set.
    const wrongField = defineView({
      componentType: CT_A,
      props: { title: { field: 'fld_dddddddd-0000-4000-8000-000000000004', type: 'string' } },
      render: () => null,
    })
    draw(core, tableOf({ name: 'Wrong.tsx', view: wrongField }))
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]?.[0]).toContain('Wrong.tsx')
  })

  it('gives no warning for views that match their definitions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    draw(createCore(baseModel()))
    expect(warn).not.toHaveBeenCalled()
  })
})
