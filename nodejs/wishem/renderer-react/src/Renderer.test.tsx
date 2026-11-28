import { createStore, storeInputs, type Model } from '@thrashplay/wishem-core'
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
            return <span>{`heading:${String(props.heading)}`}</span>
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
      expect(keys.at(-1)).toEqual(['heading'])
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

      expect(received[0]).toEqual({ maxHealth: '12', other: undefined })
      expect(Object.keys(received[0] ?? {})).toEqual(['maxHealth', 'other'])
    })

    it('mounts the function of the view as a React component', async () => {
      const Counter = ({ title }: ViewProps) => {
        const [count] = useState(7)
        return <span>{`${String(title)}:${count}`}</span>
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
        view: ({ other }) => <span className='b'>{`other:${other ?? 'none'}`}</span>,
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
        tableOf({ ...sourceA, view: ({ maxHealth }) => <span>{`max:${String(maxHealth)}`}</span> }),
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
})
