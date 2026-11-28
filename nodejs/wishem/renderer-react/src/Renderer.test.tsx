import { createStore, storeInputs, type Entity, type Model } from '@thrashplay/wishem-core'
import {
  createChannelPair,
  createHub,
  hubInputs,
  openLink,
  serveLink,
  type ModelSubsystem,
  type Port,
  type RemoteLink,
} from '@thrashplay/wishem-hub'
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectViews, type ViewProps } from './collect-views.js'
import { Renderer, type PortReader } from './Renderer.js'
import type { InputPort, ViewTools } from './view-tools.js'

const CT_A = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const CT_B = 'ct_bbbbbbbb-0000-4000-8000-000000000002'
const CT_C = 'ct_cccccccc-0000-4000-8000-000000000003'
const FLD_TITLE = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const FLD_OTHER = 'fld_aaaaaaaa-0000-4000-8000-000000000012'
const FLD_MAX_A = 'fld_aaaaaaaa-0000-4000-8000-000000000013'
const FLD_MAX_B = 'fld_aaaaaaaa-0000-4000-8000-000000000014'
const E1 = 'e_aaaaaaaa-0000-4000-8000-000000000021'
const E2 = 'e_aaaaaaaa-0000-4000-8000-000000000022'

const inputs = storeInputs()

const baseModel = (titleOne: string | null = 'One'): Model => ({
  definitions: [
    { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'title', type: 'string' }] },
    { id: CT_B, label: 'B', fields: [{ id: FLD_OTHER, label: 'other', type: 'string' }] },
  ],
  entities: [
    { id: E1, components: { [CT_A]: titleOne === null ? {} : { [FLD_TITLE]: titleOne } } },
    { id: E2, components: { [CT_A]: { [FLD_TITLE]: 'Two' }, [CT_B]: { [FLD_OTHER]: 'x' } } },
  ],
})

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part) => ({ count: part.count + 1 }),
}

/** A hub that holds the model, with an input port and an output port. */
const startWorld = (model: Model) => {
  const hub = createHub({ subsystems: [createStore({ model }), counter] })
  hub.start()
  const input = hub.attach({ id: 'tester', kind: 'input' })
  const output = hub.attach({ id: 'screen', kind: 'output' })
  return { hub, input, output }
}

const setTitle = async (input: Port, entity: string, value: string) => {
  const result = await input.submit(inputs.setField({ entity, componentType: CT_A, field: FLD_TITLE, value }))
  expect(result.ok).toBe(true)
}

/** A port that counts the listeners that are registered on it. */
const counting = (port: PortReader) => {
  let active = 0
  return {
    read: () => port.read(),
    subscribe: (listener: Parameters<PortReader['subscribe']>[0]) => {
      active += 1
      const remove = port.subscribe(listener)
      let removed = false
      return () => {
        if (!removed) {
          removed = true
          active -= 1
        }
        remove()
      }
    },
    listeners: () => active,
  }
}

const text = (value: unknown): string =>
  value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ?
    String(value)
  : ''

const viewA = ({ title }: ViewProps) => (
  <span className='a'>{title === undefined ? 'none' : `title:${text(title)}`}</span>
)

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

  const draw = (port: PortReader, views = tableOf(sourceA)) => {
    act(() => {
      root.render(<Renderer port={port} views={views} />)
    })
  }

  const wrappers = () => Array.from(container.querySelectorAll<HTMLElement>('[data-wishem-entity]'))

  describe('the port', () => {
    it('draws from a direct port of a hub', () => {
      draw(startWorld(baseModel()).output)
      expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['title:One', 'title:Two'])
    })

    it('draws the same elements from a remote port of a link', async () => {
      const { hub, output } = startWorld(baseModel())
      draw(output)
      const direct = container.innerHTML

      const [clientChannel, hubChannel] = createChannelPair()
      serveLink(hub, hubChannel)
      let link: RemoteLink | undefined
      await act(async () => {
        link = await openLink(clientChannel, [{ id: 'remote', kind: 'output' }])
      })
      draw(link?.ports.remote as Port)

      expect(direct).not.toBe('')
      expect(container.innerHTML).toBe(direct)
    })

    it('reads the new port, removes its listener from the old port, and ignores the old port', async () => {
      const first = startWorld(baseModel('First'))
      const second = startWorld(baseModel('Second'))
      const oldPort = counting(first.output)
      const newPort = counting(second.output)

      draw(oldPort)
      expect(oldPort.listeners()).toBe(1)
      draw(newPort)

      expect(wrappers()[0]?.textContent).toBe('title:Second')
      expect(oldPort.listeners()).toBe(0)
      expect(newPort.listeners()).toBe(1)

      await act(async () => {
        await setTitle(first.input, E1, 'Changed')
      })
      expect(wrappers()[0]?.textContent).toBe('title:Second')
    })

    it('leaves no listener and keeps the port open after the renderer is removed', async () => {
      const { hub, input, output } = startWorld(baseModel())
      const port = counting(output)
      draw(port)
      expect(port.listeners()).toBe(1)

      act(() => {
        root.render(null)
      })

      expect(port.listeners()).toBe(0)
      await expect(setTitle(input, E1, 'After')).resolves.toBeUndefined()
      expect(hub.status).toBe('running')
      expect(output.read().store).toBeDefined()
      // The port is still open: it still accepts a listener.
      const seen: string[] = []
      const remove = output.subscribe((event) => seen.push(event.type))
      await setTitle(input, E1, 'Again')
      remove()
      expect(seen).toEqual(['applied'])
    })

    it('leaves no input in the record of the hub', () => {
      const { hub, output } = startWorld(baseModel())
      draw(output)
      expect(hub.record()).toEqual([])
    })

    it('keeps the last picture when the link of a remote port ends', async () => {
      const { hub } = startWorld(baseModel())
      const [clientChannel, hubChannel] = createChannelPair()
      serveLink(hub, hubChannel)
      let link: RemoteLink | undefined
      await act(async () => {
        link = await openLink(clientChannel, [{ id: 'remote', kind: 'output' }])
      })
      draw(link?.ports.remote as Port)
      const before = container.innerHTML

      await act(async () => {
        link?.close()
        await link?.closed
      })

      expect(before).toContain('title:One')
      expect(container.innerHTML).toBe(before)
    })

    it('lets two renderers on one port draw, and each removes only its own listener', () => {
      const { output } = startWorld(baseModel())
      const port = counting(output)
      const other = document.createElement('div')
      document.body.append(other)
      const otherRoot = createRoot(other)
      const views = tableOf(sourceA)

      act(() => {
        root.render(<Renderer port={port} views={views} />)
        otherRoot.render(<Renderer port={port} views={views} />)
      })
      expect(port.listeners()).toBe(2)
      expect(other.textContent).toBe('title:Onetitle:Two')
      expect(container.textContent).toBe('title:Onetitle:Two')

      act(() => {
        otherRoot.unmount()
      })
      expect(port.listeners()).toBe(1)
      act(() => {
        root.render(null)
      })
      expect(port.listeners()).toBe(0)
      other.remove()
    })

    it('has one listener of the renderer after the mount in StrictMode', () => {
      const { output } = startWorld(baseModel())
      const port = counting(output)
      act(() => {
        root.render(
          <StrictMode>
            <Renderer port={port} views={tableOf(sourceA)} />
          </StrictMode>,
        )
      })
      expect(port.listeners()).toBe(1)
      expect(wrappers()).toHaveLength(2)
    })

    it('draws nothing and logs no error when the joined state has no part store', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      draw({ read: () => ({}), subscribe: () => () => undefined })
      expect(container.innerHTML).toBe('')
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })

    it('draws nothing for an empty table of views', () => {
      draw(startWorld(baseModel()).output, collectViews({}, {}))
      expect(container.innerHTML).toBe('')
    })
  })

  describe('the picture follows the part store', () => {
    it('draws the new value after an input changes the store', async () => {
      const { input, output } = startWorld(baseModel('One'))
      draw(output)
      await act(async () => {
        await setTitle(input, E1, 'Hello')
      })
      expect(wrappers()[0]?.textContent).toBe('title:Hello')
    })

    it('draws the first title after a rewind to before a change', async () => {
      const { input, output } = startWorld(baseModel('One'))
      draw(output)
      let seq = -1
      await act(async () => {
        const result = await input.submit(
          inputs.setField({ entity: E1, componentType: CT_A, field: FLD_TITLE, value: 'Changed' }),
        )
        seq = result.ok ? result.seq - 1 : -1
      })
      expect(wrappers()[0]?.textContent).toBe('title:Changed')
      await act(async () => {
        expect((await input.submit(hubInputs.rewind(seq))).ok).toBe(true)
      })
      expect(wrappers()[0]?.textContent).toBe('title:One')
    })

    it('calls no view again after an input that leaves the part store the same object', async () => {
      const { input, output } = startWorld(baseModel())
      const calls = vi.fn()
      draw(
        output,
        tableOf({
          ...sourceA,
          view: (props) => {
            calls()
            return viewA(props)
          },
        }),
      )
      const before = calls.mock.calls.length
      const store = output.read().store

      await act(async () => {
        await input.submit({ type: 'counter/add' })
      })

      expect(output.read().store).toBe(store)
      expect(output.read().counter).toEqual({ count: 1 })
      expect(calls.mock.calls.length).toBe(before)
    })

    it('calls no view again on the event stopping', () => {
      const { hub, output } = startWorld(baseModel())
      const calls = vi.fn()
      draw(
        output,
        tableOf({
          ...sourceA,
          view: (props) => {
            calls()
            return viewA(props)
          },
        }),
      )
      const before = calls.mock.calls.length
      act(() => {
        hub.stop()
      })
      expect(hub.status).toBe('stopped')
      expect(calls.mock.calls.length).toBe(before)
      expect(wrappers()).toHaveLength(2)
    })

    it('gives the value under the new name when the label of a field changes while the page is open', async () => {
      const { input, output } = startWorld(baseModel('One'))
      const keys: string[][] = []
      draw(
        output,
        tableOf({
          ...sourceA,
          view: (props) => {
            keys.push(Object.keys(props))
            return <span>{`heading:${text(props.heading)}`}</span>
          },
        }),
      )
      expect(wrappers()[0]?.textContent).toBe('heading:undefined')

      const model = baseModel('One')
      await act(async () => {
        await input.submit(
          inputs.replaceModel({
            ...model,
            definitions: [
              { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'heading', type: 'string' }] },
              model.definitions[1],
            ],
          }),
        )
      })

      expect(wrappers()[0]?.textContent).toBe('heading:One')
      expect(keys.at(-1)).toEqual(['heading', 'wishem'])
    })
  })

  describe('what is drawn', () => {
    it('draws one wrapper for each component that has a view, with the two attributes', () => {
      draw(startWorld(baseModel()).output)
      const found = wrappers()
      expect(found).toHaveLength(2)
      expect(found[0]?.dataset.wishemComponentType).toBe(CT_A)
      expect(found[0]?.style.display).toBe('contents')
    })

    it('draws in the order of the entities', () => {
      draw(startWorld(baseModel()).output)
      expect(wrappers().map((wrapper) => wrapper.dataset.wishemEntity)).toEqual([E1, E2])
      expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['title:One', 'title:Two'])
    })

    it('gives the element of a view its entity from the wrapper', () => {
      draw(startWorld(baseModel()).output)
      const element = container.querySelectorAll('.a')[1]
      expect(element.closest<HTMLElement>('[data-wishem-entity]')?.dataset.wishemEntity).toBe(E2)
    })

    it('gives a view no value for a field that the component omits', () => {
      draw(startWorld(baseModel(null)).output)
      expect(wrappers()[0]?.textContent).toBe('none')
    })

    it('gives a view one prop for each field of the definition, with the names of propNames', () => {
      const received: ViewProps[] = []
      const model: Model = {
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
        startWorld(model).output,
        tableOf({
          ...sourceA,
          view: (props) => {
            received.push(props)
            return null
          },
        }),
      )

      expect(received[0]).toEqual({ maxHealth: '12', other: undefined, wishem: expect.anything() })
      expect(Object.keys(received[0] ?? {})).toEqual(['maxHealth', 'other', 'wishem'])
    })

    it('mounts the function of the view as a React component', async () => {
      const Counter = ({ title }: ViewProps) => {
        const [count] = useState(7)
        return <span>{`${text(title)}:${count}`}</span>
      }
      const { input, output } = startWorld(baseModel())
      draw(output, tableOf({ ...sourceA, view: Counter }))
      expect(wrappers()[0]?.textContent).toBe('One:7')

      // A change of the number of views changes the hooks of the renderer if a view is not a component.
      const model = baseModel()
      await act(async () => {
        await input.submit(inputs.replaceModel({ ...model, entities: model.entities.slice(0, 1) }))
      })
      expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['One:7'])
    })

    it('draws nothing for a component type that has no view, and logs no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      draw(startWorld(baseModel()).output)
      expect(container.querySelectorAll(`[data-wishem-component-type="${CT_B}"]`)).toHaveLength(0)
      expect(error).not.toHaveBeenCalled()
    })

    it('draws nothing for an entity that has no component of a type, and logs no error', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      draw(startWorld(baseModel()).output, tableOf(sourceA, { name: 'B', componentType: CT_B, view: () => <b /> }))
      expect(container.querySelectorAll(`[data-wishem-component-type="${CT_B}"]`)).toHaveLength(1)
      expect(wrappers().filter((wrapper) => wrapper.dataset.wishemEntity === E1)).toHaveLength(1)
      expect(error).not.toHaveBeenCalled()
    })

    describe('with a view for each of two component types', () => {
      const sourceB: ViewSource = {
        name: 'B',
        componentType: CT_B,
        view: ({ other }) => <span className='b'>{`other:${text(other ?? 'none')}`}</span>,
      }
      const model: Model = {
        ...baseModel(),
        entities: [
          { id: E1, components: { [CT_B]: { [FLD_OTHER]: 'y' } } },
          { id: E2, components: { [CT_A]: { [FLD_TITLE]: 'Two' }, [CT_B]: { [FLD_OTHER]: 'x' } } },
        ],
      }

      it('draws in the order of the entities, then of the definitions', () => {
        draw(startWorld(model).output, tableOf(sourceA, sourceB))
        expect(wrappers().map((wrapper) => wrapper.textContent)).toEqual(['other:y', 'title:Two', 'other:x'])
      })

      it('marks each wrapper with its own entity and component type', () => {
        draw(startWorld(model).output, tableOf(sourceA, sourceB))
        expect(
          wrappers().map((wrapper) => [wrapper.dataset.wishemEntity, wrapper.dataset.wishemComponentType]),
        ).toEqual([
          [E1, CT_B],
          [E2, CT_A],
          [E2, CT_B],
        ])
      })
    })
  })

  describe('warnings', () => {
    it('writes one warning with the two field IDs for two labels that give the same name, and keeps drawing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const model: Model = {
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

      draw(
        startWorld(model).output,
        tableOf({ ...sourceA, view: ({ maxHealth }) => <span>{`max:${text(maxHealth)}`}</span> }),
      )

      expect(wrappers()[0]?.textContent).toBe('max:first')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('A.view.json')
      expect(String(warn.mock.calls[0]?.[0])).toContain(FLD_MAX_A)
      expect(String(warn.mock.calls[0]?.[0])).toContain(FLD_MAX_B)
    })

    it('writes the warnings when the set of warnings changes, and not again for the same set', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const missing: ViewSource = { name: 'Missing', componentType: CT_C, view: () => null }
      const { input, output } = startWorld(baseModel('One'))
      draw(output, tableOf(sourceA, missing))
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('Missing.view.json')
      expect(String(warn.mock.calls[0]?.[0])).toContain(CT_C)
      await act(async () => {
        await setTitle(input, E1, 'Two')
      })
      expect(warn).toHaveBeenCalledTimes(1)
      // A new warning changes the set.
      draw(
        output,
        tableOf(sourceA, missing, {
          name: 'Other',
          componentType: 'ct_dddddddd-0000-4000-8000-000000000004',
          view: () => null,
        }),
      )
      expect(warn).toHaveBeenCalledTimes(3)
      expect(String(warn.mock.calls[2]?.[0])).toContain('Other.view.json')
    })

    it('gives no new warning when the model gains the definition of a component type', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const model = baseModel()
      const { input, output } = startWorld({
        ...model,
        definitions: model.definitions.filter(({ id }) => id !== CT_A),
        entities: [],
      })

      draw(output)
      expect(warn).toHaveBeenCalledTimes(1)
      await act(async () => {
        await input.submit(inputs.replaceModel(model))
      })

      expect(warn).toHaveBeenCalledTimes(1)
      expect(wrappers()).toHaveLength(2)
    })

    it('writes a warning again when the definition is removed after it was added', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const model = baseModel()
      const withoutA = { ...model, definitions: model.definitions.filter(({ id }) => id !== CT_A), entities: [] }
      const { input, output } = startWorld(withoutA)

      draw(output)
      await act(async () => {
        await input.submit(inputs.replaceModel(model))
      })
      expect(warn).toHaveBeenCalledTimes(1)
      await act(async () => {
        await input.submit(inputs.replaceModel(withoutA))
      })

      expect(warn).toHaveBeenCalledTimes(2)
    })

    it('gives no warning for views that match their definitions', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      draw(startWorld(baseModel()).output)
      expect(warn).not.toHaveBeenCalled()
    })

    it('writes one warning for each warning of a set', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      draw(
        startWorld(baseModel()).output,
        tableOf(
          { name: 'One', componentType: CT_C, view: () => null },
          { name: 'Two', componentType: 'ct_cccccccc-0000-4000-8000-000000000004', view: () => null },
        ),
      )
      expect(warn).toHaveBeenCalledTimes(2)
      expect(String(warn.mock.calls[0]?.[0])).toContain('One.view.json')
      expect(String(warn.mock.calls[1]?.[0])).toContain('Two.view.json')
    })

    it('draws the same view when the label of the component type changes', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { input, output } = startWorld(baseModel('One'))
      draw(output)
      const before = container.innerHTML
      const model = baseModel('One')

      await act(async () => {
        await input.submit(
          inputs.replaceModel({
            ...model,
            definitions: model.definitions.map((definition) =>
              definition.id === CT_A ? { ...definition, label: 'Header' } : definition,
            ),
          }),
        )
      })

      expect(container.innerHTML).toBe(before)
      expect(warn).not.toHaveBeenCalled()
    })
  })
  describe('the inputs of a view', () => {
    const SEEN_VIEW_SOURCE = (seen: ViewTools[]): ViewSource => ({
      name: 'A',
      componentType: CT_A,
      view: ({ wishem }: ViewProps) => {
        seen.push(wishem)
        return null
      },
    })

    const render = (output: PortReader, views: ReturnType<typeof tableOf>, input?: InputPort, strict = false) => {
      const element = <Renderer port={output} views={views} input={input} />
      act(() => {
        root.render(strict ? <StrictMode>{element}</StrictMode> : element)
      })
    }

    it('gives each view the prop wishem with setField and submit', () => {
      const seen: ViewTools[] = []
      render(startWorld(baseModel()).output, tableOf(SEEN_VIEW_SOURCE(seen)))
      expect(seen.length).toBeGreaterThan(0)
      expect(typeof seen[0]?.setField).toBe('function')
      expect(typeof seen[0]?.submit).toBe('function')
    })

    it('gives the same wishem after a change of a value', async () => {
      const seen: ViewTools[] = []
      const { input, output } = startWorld(baseModel())
      render(output, tableOf(SEEN_VIEW_SOURCE(seen)), input)
      const first = seen.at(-1)
      const renders = seen.length

      await act(async () => {
        await setTitle(input, E1, 'Changed')
      })

      expect(seen.length).toBeGreaterThan(renders)
      expect(new Set(seen).size).toBe(2)
      expect(seen.at(-1)).toBe(first)
    })

    it('gives a new wishem after a change of the definition', async () => {
      const seen: ViewTools[] = []
      const { input, output } = startWorld(baseModel())
      render(output, tableOf(SEEN_VIEW_SOURCE(seen)), input)
      const before = new Set(seen)
      const model = baseModel()

      await act(async () => {
        await input.submit(
          inputs.replaceModel({
            ...model,
            definitions: model.definitions.map((definition) =>
              definition.id === CT_A ? { ...definition, label: 'Header' } : definition,
            ),
          }),
        )
      })

      expect(before.has(seen.at(-1) as ViewTools)).toBe(false)
    })

    it('gives a new wishem after a change of the input port', () => {
      const seen: ViewTools[] = []
      const { input, output } = startWorld(baseModel())
      const views = tableOf(SEEN_VIEW_SOURCE(seen))
      render(output, views, input)
      const first = seen.at(-1)
      render(output, views, startWorld(baseModel()).input)
      expect(seen.at(-1)).not.toBe(first)
    })

    it('gives a different wishem to each entity', () => {
      const seen: ViewTools[] = []
      render(startWorld(baseModel()).output, tableOf(SEEN_VIEW_SOURCE(seen)))
      expect(new Set(seen).size).toBe(2)
    })

    it('sends no input when the renderer draws two times and no view calls wishem', () => {
      const seen: ViewTools[] = []
      const { hub, input, output } = startWorld(baseModel())
      const views = tableOf(SEEN_VIEW_SOURCE(seen))
      render(output, views, input)
      render(output, tableOf(SEEN_VIEW_SOURCE(seen)), input)
      expect(hub.record()).toEqual([])
    })

    it('sets a field: one input with the source of the input port, and the picture shows the new title', async () => {
      const hub = createHub({ subsystems: [createStore({ model: baseModel() }), counter] })
      hub.start()
      const input = hub.attach({ id: 'page-input', kind: 'input' })
      const output = hub.attach({ id: 'screen', kind: 'output' })
      const seen: ViewProps[] = []
      const views = tableOf({
        name: 'A',
        componentType: CT_A,
        view: (props: ViewProps) => {
          seen.push(props)
          return <span className='a'>{text(props.title)}</span>
        },
      })
      render(output, views, input)
      const first = seen.find((props) => props.title === 'One') as ViewProps

      await act(async () => {
        await first.wishem.setField('title', 'Hello')
      })

      expect(hub.record()).toEqual([
        expect.objectContaining({
          source: 'page-input',
          type: 'store/set-field',
          payload: { entity: E1, componentType: CT_A, field: FLD_TITLE, value: 'Hello' },
        }),
      ])
      expect(wrappers()[0]?.textContent).toBe('Hello')
    })

    it('gives not-permitted and sends no input when there is no input port', async () => {
      const seen: ViewProps[] = []
      const { hub, output } = startWorld(baseModel())
      render(
        output,
        tableOf({
          name: 'A',
          componentType: CT_A,
          view: (props: ViewProps) => {
            seen.push(props)
            return null
          },
        }),
      )
      const outcome = await seen[0].wishem.setField('title', 'Hello')
      expect(outcome).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
      expect(hub.record()).toEqual([])
    })

    it('sends the input to the old port when a view calls wishem after the renderer is removed', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const seen: ViewTools[] = []
      const { hub, input, output } = startWorld(baseModel())
      render(output, tableOf(SEEN_VIEW_SOURCE(seen)), input)
      const kept = seen[0]
      act(() => {
        root.render(null)
      })

      const outcome = await kept.setField('title', 'After')

      expect(outcome.ok).toBe(true)
      expect(hub.record()).toHaveLength(1)
      expect(error).not.toHaveBeenCalled()
    })

    it('keeps the port of its time for a call that waits, and uses the new port for the next call', async () => {
      const seen: ViewTools[] = []
      const resolvers: ((result: { ok: true; seq: number }) => void)[] = []
      const first: InputPort = {
        submit: () =>
          new Promise((resolve) => {
            resolvers.push(resolve)
          }),
      }
      const second = vi.fn(() => Promise.resolve({ ok: true as const, seq: 2 }))
      const { output } = startWorld(baseModel())
      const views = tableOf(SEEN_VIEW_SOURCE(seen))
      render(output, views, first)
      const waiting = seen[0].setField('title', 'a')
      render(output, views, { submit: second })

      resolvers[0]?.({ ok: true, seq: 1 })
      expect(await waiting).toEqual({ ok: true, seq: 1 })
      expect(second).not.toHaveBeenCalled()
      expect(await (seen.at(-1) as ViewTools).setField('title', 'b')).toEqual({ ok: true, seq: 2 })
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('sends one input for one call under StrictMode', async () => {
      const seen: ViewTools[] = []
      const { hub, input, output } = startWorld(baseModel())
      render(output, tableOf(SEEN_VIEW_SOURCE(seen)), input, true)

      await act(async () => {
        await (seen.at(-1) as ViewTools).setField('title', 'Once')
      })

      expect(hub.record()).toHaveLength(1)
    })

    it('gives the view no prop for a field with a reserved name, and warns', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const seen: ViewProps[] = []
      const model = baseModel()
      const reserved: Model = {
        ...model,
        definitions: [
          { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'Wishem', type: 'string' }] },
          model.definitions[1],
        ],
      }
      render(
        startWorld(reserved).output,
        tableOf({
          name: 'A',
          componentType: CT_A,
          view: (props: ViewProps) => {
            seen.push(props)
            return null
          },
        }),
      )
      expect(typeof seen[0]?.wishem.setField).toBe('function')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('reserved name "wishem"')
    })

    it('gives the view no prop for a field with an empty name, and warns', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const seen: ViewProps[] = []
      const model = baseModel()
      const empty: Model = {
        ...model,
        definitions: [
          { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: '???', type: 'string' }] },
          model.definitions[1],
        ],
      }
      render(
        startWorld(empty).output,
        tableOf({
          name: 'A',
          componentType: CT_A,
          view: (props: ViewProps) => {
            seen.push(props)
            return null
          },
        }),
      )
      expect(seen[0]).toBeDefined()
      expect(Object.keys(seen[0] ?? {})).not.toContain('')
      expect(typeof seen[0]?.wishem.setField).toBe('function')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('gives an empty name')
    })
  })

  describe('nested views', () => {
    const CT_LIST = 'ct_dddddddd-0000-4000-8000-000000000004'
    const FLD_FIRST = 'fld_dddddddd-0000-4000-8000-000000000015'
    const E3 = 'e_aaaaaaaa-0000-4000-8000-000000000023'
    const E4 = 'e_aaaaaaaa-0000-4000-8000-000000000024'

    const listView = ({ first }: ViewProps) => <section className='list'>{first}</section>
    const listSource: ViewSource = { name: 'List', componentType: CT_LIST, view: listView }

    const nested = (entities: Model['entities']): Model => ({
      definitions: [
        { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'title', type: 'string' }] },
        { id: CT_LIST, label: 'List', fields: [{ id: FLD_FIRST, label: 'first', type: 'reference' }] },
      ],
      entities,
    })
    const task = (id: string, title: string): Entity => ({ id, components: { [CT_A]: { [FLD_TITLE]: title } } })
    const list = (id: string, first?: string): Entity => ({
      id,
      components: { [CT_LIST]: first === undefined ? {} : { [FLD_FIRST]: first } },
    })
    const topLevel = () => Array.from(container.children).map((child) => child.getAttribute('data-wishem-entity'))
    const entityTexts = (parent: ParentNode) =>
      Array.from(parent.querySelectorAll('[data-wishem-entity]')).map(
        (wrapper) => `${wrapper.getAttribute('data-wishem-entity') ?? ''}:${wrapper.textContent}`,
      )

    it('draws a held entity in the picture of its holder, and not at the top level', () => {
      draw(startWorld(nested([task(E1, 'Task'), list(E2, E1)])).output, tableOf(sourceA, listSource))
      expect(topLevel()).toEqual([E2])
      const held = container.querySelector(`[data-wishem-entity="${E2}"] [data-wishem-entity="${E1}"]`)
      expect(held?.getAttribute('data-wishem-component-type')).toBe(CT_A)
      expect(held?.textContent).toBe('title:Task')
    })

    it('draws a held entity in the place of each of two holders', () => {
      draw(startWorld(nested([task(E1, 'Task'), list(E2, E1), list(E3, E1)])).output, tableOf(sourceA, listSource))
      expect(topLevel()).toEqual([E2, E3])
      expect(entityTexts(container.children[0])).toEqual([`${E1}:title:Task`])
      expect(entityTexts(container.children[1])).toEqual([`${E1}:title:Task`])
    })

    it('draws a held entity at the top level when its holder has no view', () => {
      draw(startWorld(nested([task(E1, 'Task'), list(E2, E1)])).output, tableOf(sourceA))
      expect(topLevel()).toEqual([E1])
    })

    it('draws one picture for each component of the held entity that has a view, in the order of the definitions', () => {
      const model: Model = {
        definitions: [
          { id: CT_A, label: 'A', fields: [{ id: FLD_TITLE, label: 'title', type: 'string' }] },
          { id: CT_B, label: 'B', fields: [{ id: FLD_OTHER, label: 'other', type: 'string' }] },
          { id: CT_LIST, label: 'List', fields: [{ id: FLD_FIRST, label: 'first', type: 'reference' }] },
        ],
        entities: [
          { id: E1, components: { [CT_B]: { [FLD_OTHER]: 'b' }, [CT_A]: { [FLD_TITLE]: 'a' } } },
          list(E2, E1),
        ],
      }
      const viewB = ({ other }: ViewProps) => <span>{`other:${text(other)}`}</span>
      draw(startWorld(model).output, tableOf(sourceA, { name: 'B', componentType: CT_B, view: viewB }, listSource))
      expect(entityTexts(container.children[0])).toEqual([`${E1}:title:a`, `${E1}:other:b`])
    })

    it('gives the prop of a reference field no value when the component omits the field', () => {
      const seen: unknown[] = []
      draw(
        startWorld(nested([list(E2)])).output,
        tableOf({
          ...listSource,
          view: (props: ViewProps) => {
            seen.push(props.first)
            return null
          },
        }),
      )
      expect(seen).toEqual([undefined])
    })

    it('gives a picture that draws nothing for a held entity with no view', () => {
      const model = nested([{ id: E1, components: {} }, list(E2, E1)])
      draw(startWorld(model).output, tableOf(listSource))
      expect(container.querySelector('.list')?.innerHTML).toBe('')
      expect(topLevel()).toEqual([E2])
    })

    it('moves the held entity when an input changes the reference of the holder', async () => {
      const { input, output } = startWorld(nested([task(E1, 'Task'), task(E3, 'Other'), list(E2, E1)]))
      draw(output, tableOf(sourceA, listSource))
      expect(topLevel()).toEqual([E3, E2])

      await act(async () => {
        const result = await input.submit(
          inputs.setField({ entity: E2, componentType: CT_LIST, field: FLD_FIRST, value: E3 }),
        )
        expect(result.ok).toBe(true)
      })

      expect(topLevel()).toEqual([E1, E2])
      expect(entityTexts(container.children[1])).toEqual([`${E3}:title:Other`])
    })

    it('draws the held entity at the top level when an input removes the holder', async () => {
      const { input, output } = startWorld(nested([task(E1, 'Task'), list(E2, E1)]))
      draw(output, tableOf(sourceA, listSource))
      expect(topLevel()).toEqual([E2])

      await act(async () => {
        expect((await input.submit(inputs.removeEntity(E2))).ok).toBe(true)
      })

      expect(topLevel()).toEqual([E1])
    })

    it('sends the input of a held view for the held entity, not the holder', async () => {
      const submit = vi.fn(() => Promise.resolve({ ok: true as const, seq: 1 }))
      const taskView = ({ wishem }: ViewProps) => (
        <button
          onClick={() => {
            void wishem.setField('title', 'Renamed')
          }}
        />
      )
      act(() => {
        root.render(
          <Renderer
            port={startWorld(nested([task(E1, 'Task'), list(E2, E1)])).output}
            views={tableOf({ ...sourceA, view: taskView }, listSource)}
            input={{ submit }}
          />,
        )
      })

      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
      })

      expect(submit).toHaveBeenCalledWith(
        inputs.setField({ entity: E1, componentType: CT_A, field: FLD_TITLE, value: 'Renamed' }),
      )
    })

    it('calls no view again after an input that leaves the part store the same object, also a held view', async () => {
      const { input, output } = startWorld(nested([task(E1, 'Task'), list(E2, E1)]))
      const calls = vi.fn()
      draw(
        output,
        tableOf(
          {
            ...sourceA,
            view: (props) => {
              calls()
              return viewA(props)
            },
          },
          listSource,
        ),
      )
      const before = calls.mock.calls.length
      expect(before).toBeGreaterThan(0)
      const store = output.read().store

      await act(async () => {
        await input.submit({ type: 'counter/add' })
      })

      expect(output.read().store).toBe(store)
      expect(calls.mock.calls.length).toBe(before)
    })

    describe('a cycle', () => {
      it('draws each entity one time on its path, and warns one time', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        draw(startWorld(nested([list(E1, E2), list(E2, E3), list(E3, E2)])).output, tableOf(listSource))

        expect(topLevel()).toEqual([E1])
        expect(entityTexts(container)).toEqual([E1, E2, E3].map((id) => `${id}:`))
        expect(warn).toHaveBeenCalledTimes(1)
        const text = String(warn.mock.calls[0]?.[0])
        expect(text).toContain(E3)
        expect(text).toContain(E2)
        expect(text).toContain(FLD_FIRST)
      })

      it('draws nothing for the reference of an entity that holds itself, and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        draw(startWorld(nested([list(E1, E1)])).output, tableOf(listSource))
        expect(entityTexts(container)).toEqual([`${E1}:`])
        expect(warn).toHaveBeenCalledTimes(1)
      })

      it('draws neither entity of a cycle with no root, and warns one time', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        draw(startWorld(nested([list(E1, E2), list(E2, E1)])).output, tableOf(listSource))
        expect(container.innerHTML).toBe('')
        expect(warn).toHaveBeenCalledTimes(1)
      })

      it('gives no new warning for a second input with the same cycle, and none after the cycle is corrected', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const { input, output } = startWorld(nested([list(E1, E2), list(E2, E3), list(E3, E2), task(E4, 'x')]))
        draw(output, tableOf(sourceA, listSource))
        expect(warn).toHaveBeenCalledTimes(1)

        await act(async () => {
          await setTitle(input, E4, 'y')
        })
        expect(warn).toHaveBeenCalledTimes(1)

        await act(async () => {
          await input.submit(inputs.setField({ entity: E3, componentType: CT_LIST, field: FLD_FIRST, value: E4 }))
        })
        expect(warn).toHaveBeenCalledTimes(1)
        expect(entityTexts(container)).toContain(`${E4}:title:y`)
      })
    })
  })
})
