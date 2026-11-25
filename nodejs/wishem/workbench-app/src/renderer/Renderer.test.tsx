import { createCore, type Core, type Snapshot } from '@thrashplay/wishem-core'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectViews, type ViewProps } from './collect-views.js'
import { Renderer } from './Renderer.js'

const CT_A = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const CT_B = 'ct_bbbbbbbb-0000-4000-8000-000000000002'
const CT_C = 'ct_cccccccc-0000-4000-8000-000000000003'
const FLD_TITLE = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const FLD_OTHER = 'fld_aaaaaaaa-0000-4000-8000-000000000012'
const FLD_MAX_A = 'fld_aaaaaaaa-0000-4000-8000-000000000013'
const FLD_MAX_B = 'fld_aaaaaaaa-0000-4000-8000-000000000014'
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

const viewA = ({ title }: ViewProps) => <span className='a'>{title === undefined ? 'none' : `title:${title}`}</span>

interface ViewSource {
  name: string
  componentType: string
  view: (props: ViewProps) => unknown
}

const tableOf = (...sources: ViewSource[]) =>
  collectViews(
    Object.fromEntries(
      sources.map(({ name, componentType }) => [
        `./views/${name}.view.json`,
        { default: { kind: 'react', componentType } },
      ]),
    ),
    Object.fromEntries(sources.map(({ name, view }) => [`./views/${name}.tsx`, { default: view }])),
  )

const sourceA: ViewSource = { name: 'A', componentType: CT_A, view: viewA }

const withLabel = (core: Core, label: string): Snapshot => {
  const model = core.getSnapshot()
  return {
    ...model,
    definitions: model.definitions.map((definition) =>
      definition.id === CT_A ? { ...definition, fields: [{ id: FLD_TITLE, label, type: 'string' }] } : definition,
    ),
  }
}

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

  const draw = (core: Core, views = tableOf(sourceA)) => {
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

  it('gives a view one prop for each field of the definition, with the names of propNames', () => {
    const received: ViewProps[] = []
    const model: Snapshot = {
      definitions: [
        {
          id: CT_A,
          label: 'A',
          fields: [
            { id: FLD_TITLE, label: 'Max health', type: 'string' },
            { id: FLD_OTHER, label: 'other', type: 'string' },
          ],
        },
      ],
      entities: [{ id: E1, components: { [CT_A]: { [FLD_TITLE]: '12' } } }],
    }

    draw(
      createCore(model),
      tableOf({
        ...sourceA,
        view: (props) => {
          received.push(props)
          return null
        },
      }),
    )

    expect(received[0]).toEqual({ maxHealth: '12', other: undefined })
    expect(Object.keys(received[0] ?? {})).toEqual(['maxHealth', 'other'])
  })

  it('mounts the function of the view as a React component', () => {
    const Counter = ({ title }: ViewProps) => {
      const [count] = useState(7)
      return <span>{`${String(title)}:${count}`}</span>
    }

    draw(createCore(baseModel()), tableOf({ ...sourceA, view: Counter }))

    expect(wrappers()[0]?.textContent).toBe('One:7')
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

  it('gives the value under the new name when the label of a field changes while the page is open', () => {
    const core = createCore(baseModel('One'))
    const keys: string[][] = []
    const views = tableOf({
      ...sourceA,
      view: (props) => {
        keys.push(Object.keys(props))
        return <span>{`heading:${String(props.heading)}`}</span>
      },
    })
    draw(core, views)
    expect(wrappers()[0]?.textContent).toBe('heading:undefined')

    act(() => {
      core.setModel(withLabel(core, 'heading'))
    })

    expect(wrappers()[0]?.textContent).toBe('heading:One')
    expect(keys.at(-1)).toEqual(['heading'])
  })

  it('writes one warning with the two field IDs for two labels that give the same name, and keeps drawing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const model: Snapshot = {
      definitions: [
        {
          id: CT_A,
          label: 'A',
          fields: [
            { id: FLD_MAX_A, label: 'Max health', type: 'string' },
            { id: FLD_MAX_B, label: 'max-health', type: 'string' },
          ],
        },
      ],
      entities: [{ id: E1, components: { [CT_A]: { [FLD_MAX_A]: 'first', [FLD_MAX_B]: 'second' } } }],
    }

    draw(createCore(model), tableOf({ ...sourceA, view: ({ maxHealth }) => <span>{`max:${String(maxHealth)}`}</span> }))

    expect(wrappers()[0]?.textContent).toBe('max:first')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('A.view.json')
    expect(String(warn.mock.calls[0]?.[0])).toContain(FLD_MAX_A)
    expect(String(warn.mock.calls[0]?.[0])).toContain(FLD_MAX_B)
  })

  it('writes the warnings when the set of warnings changes, and not again for the same set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const missing: ViewSource = { name: 'Missing', componentType: CT_C, view: () => null }
    const core = createCore(baseModel('One'))
    draw(core, tableOf(sourceA, missing))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('Missing.view.json')
    expect(warn.mock.calls[0]?.[0]).toContain(CT_C)
    act(() => {
      core.setModel(baseModel('Two'))
    })
    expect(warn).toHaveBeenCalledTimes(1)
    // A new warning changes the set.
    draw(
      core,
      tableOf(sourceA, missing, {
        name: 'Other',
        componentType: 'ct_dddddddd-0000-4000-8000-000000000004',
        view: () => null,
      }),
    )
    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn.mock.calls[2]?.[0]).toContain('Other.view.json')
  })

  it('gives no warning for views that match their definitions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    draw(createCore(baseModel()))
    expect(warn).not.toHaveBeenCalled()
  })

  it('writes one warning for each warning of a set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    draw(
      createCore(baseModel()),
      tableOf(
        { name: 'One', componentType: CT_C, view: () => null },
        { name: 'Two', componentType: 'ct_cccccccc-0000-4000-8000-000000000004', view: () => null },
      ),
    )

    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0]?.[0])).toContain('One.view.json')
    expect(String(warn.mock.calls[1]?.[0])).toContain('Two.view.json')
  })

  it('draws the same view when the label of the component type changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const core = createCore(baseModel('One'))
    draw(core)
    const before = container.innerHTML

    act(() => {
      const model = baseModel('One')
      core.setModel({
        ...model,
        definitions: model.definitions.map((definition) =>
          definition.id === CT_A ? { ...definition, label: 'Header' } : definition,
        ),
      })
    })

    expect(container.innerHTML).toBe(before)
    expect(warn).not.toHaveBeenCalled()
  })

  it('gives no new warning when the next snapshot adds the definition of the component type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const model = baseModel()
    const core = createCore({ ...model, definitions: model.definitions.filter(({ id }) => id !== CT_A), entities: [] })

    draw(core)
    expect(warn).toHaveBeenCalledTimes(1)
    act(() => {
      core.setModel(model)
    })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(wrappers()).toHaveLength(2)
  })

  describe('with a view for each of two component types', () => {
    const sourceB: ViewSource = {
      name: 'B',
      componentType: CT_B,
      view: ({ other }) => <span className='b'>{`other:${other ?? 'none'}`}</span>,
    }
    const model: Snapshot = {
      ...baseModel(),
      entities: [
        { id: E1, components: { [CT_B]: { [FLD_OTHER]: 'y' } } },
        { id: E2, components: { [CT_A]: { [FLD_TITLE]: 'Two' }, [CT_B]: { [FLD_OTHER]: 'x' } } },
      ],
    }
    const both = () => tableOf(sourceA, sourceB)

    it('draws in the order of the entities, then of the definitions', () => {
      draw(createCore(model), both())
      expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['other:y', 'title:Two', 'other:x'])
    })

    it('marks each wrapper with its own entity and component type', () => {
      draw(createCore(model), both())
      expect(wrappers().map((wrapper) => [wrapper.dataset.wishemEntity, wrapper.dataset.wishemComponentType])).toEqual([
        [E1, CT_B],
        [E2, CT_A],
        [E2, CT_B],
      ])
    })

    it('draws nothing for an entity that has no component of a type, and logs no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      draw(createCore(model), both())
      expect(wrappers().filter((wrapper) => wrapper.dataset.wishemEntity === E1)).toHaveLength(1)
      expect(error).not.toHaveBeenCalled()
    })
  })
})
