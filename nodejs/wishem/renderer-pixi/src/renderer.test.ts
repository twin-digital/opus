import { Container, Sprite, Texture } from 'pixi.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore, storeInputs } from '@thrashplay/wishem-core'
import type { Entity, Model } from '@thrashplay/wishem-core'
import { createChannelPair, createHub, openLink, serveLink } from '@thrashplay/wishem-hub'
import type { HubEvent, JoinedState, ModelSubsystem, Port } from '@thrashplay/wishem-hub'
import { collectViews } from './collect-views.js'
import { startRenderer } from './renderer.js'
import type { PixiView, PortReader, ViewProps, ViewTable, Viewport } from './types.js'

const CLEAR_COLOR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const OTHER_TYPE = 'ct_7c1e2a9f-1b47-4d0a-9e51-6c2f7a1b0d35'
const COLOR_FIELD = 'fld_9a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const SECOND_FIELD = 'fld_1a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5e'
const E1 = 'e_5b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b'
const E2 = 'e_6b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b'
const E3 = 'e_7b0e2c4a-9d13-4f7e-8a26-3c1d4e5f6a7b'

const BLUE = '#1d4ed8'
const RED = '#b91c1c'
const GREEN = '#15803d'

const entity = (id: string, color?: string): Entity => ({
  id,
  components: { [CLEAR_COLOR]: color === undefined ? {} : { [COLOR_FIELD]: color } },
})

const modelOf = (...entities: Entity[]): Model => ({
  definitions: [
    { id: CLEAR_COLOR, label: 'Clear color', fields: [{ id: COLOR_FIELD, label: 'Color', type: 'string' }] },
    { id: OTHER_TYPE, label: 'Other', fields: [] },
  ],
  entities,
})

interface TestView extends PixiView<ViewProps, Sprite> {
  create: ReturnType<typeof vi.fn<() => Sprite>>
  update: ReturnType<typeof vi.fn<(display: Sprite, props: ViewProps, viewport: Viewport) => void>>
}

/** The color of a test view as a string. Throws when the value is not a string. */
const colorOf = (value: ViewProps['color']): string => {
  if (typeof value !== 'string') {
    throw new Error(`Expected a string color, got ${String(value)}`)
  }
  return value
}

/** A view that makes a sprite and sets its tint, width, and height. A component with no color is hidden. */
const makeView = (): TestView => ({
  create: vi.fn(() => new Sprite(Texture.WHITE)),
  update: vi.fn((display: Sprite, props: ViewProps, viewport: Viewport) => {
    display.width = viewport.width
    display.height = viewport.height
    display.visible = props.color !== undefined
    if (props.color !== undefined) {
      display.tint = colorOf(props.color)
    }
  }),
})

const tableOf = (view: PixiView): ViewTable =>
  new Map([[CLEAR_COLOR, { sidecar: 'ClearColor.view.json', componentType: CLEAR_COLOR, view }]])

/** The display objects of the one renderer on the stage. */
const objectsOf = (stage: Container, index = 0): Container[] => [...stage.children[index].children]

const tintsOf = (stage: Container, index = 0): number[] =>
  objectsOf(stage, index).map((object) => (object as Sprite).tint)

const hex = (color: string): number => Number.parseInt(color.slice(1), 16)

const VIEWPORT: Viewport = { width: 100, height: 50 }

/** A hub with the store, an input port, and an output port. */
const makeHub = (model: Model, extra: ModelSubsystem[] = []) => {
  const hub = createHub({ subsystems: [createStore({ model }), ...extra] })
  const editor = hub.attach({ id: 'editor', kind: 'input' })
  const screen = hub.attach({ id: 'screen', kind: 'output' })
  hub.start()
  return { hub, editor, screen }
}

/** A port that the test controls. It calls a snapshot of the listeners, in order. */
const fakePort = (read: () => JoinedState) => {
  const listeners: ((event: HubEvent) => void)[] = []
  const port: PortReader = {
    read,
    subscribe: (listener) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) {
          listeners.splice(index, 1)
        }
      }
    },
  }
  return {
    port,
    emit: (event: HubEvent) => {
      for (const listener of [...listeners]) {
        listener(event)
      }
    },
    listenerCount: () => listeners.length,
  }
}

const APPLIED: HubEvent = { type: 'applied', input: { seq: 1, source: 'editor', type: 'x', payload: null } }

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part) => ({ count: part.count + 1 }),
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startRenderer: drawing', () => {
  it('adds one display object of the view, with the color, for a direct port', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const view = makeView()
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT })

    expect(objectsOf(stage)).toHaveLength(1)
    expect(tintsOf(stage)).toEqual([hex(BLUE)])
  })

  it('gives the same tints in the same order for a direct port and a remote port', async () => {
    const model = modelOf(entity(E1, BLUE), entity(E2, RED), entity(E3, GREEN))
    const { hub, screen } = makeHub(model)
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [{ id: 'remote-screen', kind: 'output' }])
    const directStage = new Container()
    const remoteStage = new Container()

    startRenderer({ port: screen, views: tableOf(makeView()), stage: directStage, viewport: VIEWPORT })
    startRenderer({
      port: link.ports['remote-screen'],
      views: tableOf(makeView()),
      stage: remoteStage,
      viewport: VIEWPORT,
    })

    expect(tintsOf(directStage)).toEqual([hex(BLUE), hex(RED), hex(GREEN)])
    expect(tintsOf(remoteStage)).toEqual(tintsOf(directStage))
    link.close()
  })

  it('follows a change that arrives over a remote port', async () => {
    const { hub, editor } = makeHub(modelOf(entity(E1, BLUE)))
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [{ id: 'remote-screen', kind: 'output' }])
    const stage = new Container()
    startRenderer({ port: link.ports['remote-screen'], views: tableOf(makeView()), stage, viewport: VIEWPORT })

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    await vi.waitFor(() => {
      expect(tintsOf(stage)).toEqual([hex(RED)])
    })
    link.close()
  })

  it('puts the object of the second entity after the object of the first entity', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })

    expect(tintsOf(stage)).toEqual([hex(BLUE), hex(RED)])
  })

  it('adds no object for a component type with no view, and reports no error', () => {
    const model = modelOf({ id: E1, components: { [OTHER_TYPE]: {} } })
    const { screen } = makeHub(model)
    const onError = vi.fn()
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT, onError })

    expect(objectsOf(stage)).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('adds no object and reports no error for a joined state with no part store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { port } = fakePort(() => ({}))
    const onError = vi.fn()
    const stage = new Container()

    startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT, onError })

    expect(objectsOf(stage)).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('draws each component that has a view, in the order of the definitions', () => {
    const both: Entity = { id: E1, components: { [OTHER_TYPE]: {}, [CLEAR_COLOR]: { [COLOR_FIELD]: BLUE } } }
    const { screen } = makeHub(modelOf(both))
    const other = makeView()
    other.update.mockImplementation((display) => {
      display.tint = GREEN
    })
    const views: ViewTable = new Map([
      ...tableOf(makeView()),
      [OTHER_TYPE, { sidecar: 'Other.view.json', componentType: OTHER_TYPE, view: other }],
    ])
    const stage = new Container()

    startRenderer({ port: screen, views, stage, viewport: VIEWPORT })

    expect(tintsOf(stage)).toEqual([hex(BLUE), hex(GREEN)])
  })

  it('calls create one time for each component', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const view = makeView()
    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: GREEN }),
    )

    expect(view.create).toHaveBeenCalledTimes(2)
  })
})

describe('startRenderer: props and viewport', () => {
  it('gives the view the prop color with the value of the field', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const view = makeView()

    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    expect(view.update.mock.calls[0][1]).toEqual({ color: BLUE })
  })

  it('gives the prop color with no value when the component omits the field', () => {
    const { screen } = makeHub(modelOf(entity(E1)))
    const view = makeView()

    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    expect(view.update.mock.calls[0][1]).toEqual({ color: undefined })
  })

  it('gives the value of the first field when two labels have one name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const model: Model = {
      definitions: [
        {
          id: CLEAR_COLOR,
          label: 'Clear color',
          fields: [
            { id: COLOR_FIELD, label: 'Color', type: 'string' },
            { id: SECOND_FIELD, label: 'color', type: 'string' },
          ],
        },
      ],
      entities: [{ id: E1, components: { [CLEAR_COLOR]: { [COLOR_FIELD]: BLUE, [SECOND_FIELD]: RED } } }],
    }
    const { screen } = makeHub(model)
    const view = makeView()

    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    expect(view.update.mock.calls[0][1]).toEqual({ color: BLUE })
    expect(warn.mock.calls).toEqual([
      [
        `wishem: the sidecar ClearColor.view.json: the fields ${COLOR_FIELD} and ${SECOND_FIELD} of the component type ${CLEAR_COLOR} give the same name "color". The prop has the value of the first field.`,
      ],
    ])
  })

  it('reads the viewport at each update', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const viewport = { width: 100, height: 50 }
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport })

    viewport.width = 300
    viewport.height = 200
    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    const sprite = objectsOf(stage)[0] as Sprite
    expect([sprite.width, sprite.height]).toEqual([300, 200])
  })
})

describe('startRenderer: following the part store', () => {
  it('keeps the same object with the new color after store/set-field', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const before = objectsOf(stage)[0]

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    const after = objectsOf(stage)
    expect(after).toHaveLength(1)
    expect(after[0]).toBe(before)
    expect((after[0] as Sprite).tint).toBe(hex(RED))
  })

  it('does not call update after an input that leaves the part store the same object', async () => {
    const { hub, editor, screen } = makeHub(modelOf(entity(E1, BLUE)), [counter])
    const view = makeView()
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT })
    const before = objectsOf(stage)[0]
    const storeBefore = hub.read().store

    await editor.submit({ type: 'counter/add' })

    expect(hub.read().store).toBe(storeBefore)
    expect(view.update).toHaveBeenCalledTimes(1)
    expect(objectsOf(stage)[0]).toBe(before)
  })

  it('does not call update after the event stopping', () => {
    const view = makeView()
    // Each read gives a new part, so only the event type can stop the update.
    const { port, emit } = fakePort(() => ({ store: modelOf(entity(E1, BLUE)) }))
    startRenderer({ port, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })
    expect(view.update).toHaveBeenCalledTimes(1)

    emit({ type: 'stopping' })

    expect(view.update).toHaveBeenCalledTimes(1)
  })

  it('removes and destroys the object of an entity that an input removes', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const [first, second] = objectsOf(stage)

    await editor.submit(storeInputs().removeEntity(E1))

    expect(objectsOf(stage)).toEqual([second])
    expect(first.destroyed).toBe(true)
    expect(second.destroyed).toBe(false)
  })

  it('adds a new object when an entity that was removed returns', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    await editor.submit(storeInputs().removeEntity(E1))

    await editor.submit(storeInputs().addEntity(entity(E1, RED)))

    const objects = objectsOf(stage)
    expect(objects).toHaveLength(1)
    expect(objects[0].destroyed).toBe(false)
    expect((objects[0] as Sprite).tint).toBe(hex(RED))
  })

  it('adds one new object after the objects of the earlier entities for add-entity', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const [first] = objectsOf(stage)

    await editor.submit(storeInputs().addEntity(entity(E2, RED)))

    const objects = objectsOf(stage)
    expect(objects).toHaveLength(2)
    expect(objects[0]).toBe(first)
    expect((objects[1] as Sprite).tint).toBe(hex(RED))
  })

  it('puts three objects in the new order of the entities', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED), entity(E3, GREEN)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const [first, second, third] = objectsOf(stage)

    await editor.submit(storeInputs().replaceModel(modelOf(entity(E2, RED), entity(E3, GREEN), entity(E1, BLUE))))

    expect(objectsOf(stage)).toEqual([second, third, first])
  })

  it('puts the same objects in the new order of the entities', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const [first, second] = objectsOf(stage)

    await editor.submit(storeInputs().replaceModel(modelOf(entity(E2, RED), entity(E1, BLUE))))

    expect(objectsOf(stage)).toEqual([second, first])
  })

  it('keeps the objects when the link of a remote port ends', async () => {
    const { hub } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [{ id: 'remote-screen', kind: 'output' }])
    const stage = new Container()
    startRenderer({ port: link.ports['remote-screen'], views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const before = objectsOf(stage)

    link.close()
    await link.closed

    expect(objectsOf(stage)).toEqual(before)
    expect(before.every((object) => !object.destroyed)).toBe(true)
  })
})

describe('startRenderer: a view that fails', () => {
  const BOOM = new Error('boom')

  it('hides the object of a view whose update throws, reports the error one time, and sets the other object', () => {
    const view = makeView()
    const normal = view.update.getMockImplementation() as (...args: Parameters<TestView['update']>) => void
    view.update.mockImplementation((display, props, viewport) => {
      if (props.color === RED) {
        throw BOOM
      }
      normal(display, props, viewport)
    })
    const { screen } = makeHub(modelOf(entity(E1, RED), entity(E2, BLUE)))
    const onError = vi.fn()
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT, onError })

    const [failed, other] = objectsOf(stage) as Sprite[]
    expect(failed.visible).toBe(false)
    expect(other.tint).toBe(hex(BLUE))
    expect(other.visible).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(BOOM)
  })

  it('shows the object again when the next update of the view succeeds', async () => {
    // This view never sets `visible`, so only the renderer can show the object again.
    const view = makeView()
    view.update.mockImplementation((display, props) => {
      if (props.color === RED) {
        throw BOOM
      }
      display.tint = props.color === undefined ? '#000000' : colorOf(props.color)
    })
    const { editor, screen } = makeHub(modelOf(entity(E1, RED)))
    const stage = new Container()
    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT, onError: vi.fn() })
    const object = objectsOf(stage)[0] as Sprite
    expect(object.visible).toBe(false)

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: GREEN }),
    )

    expect(objectsOf(stage)[0]).toBe(object)
    expect(object.visible).toBe(true)
    expect(object.tint).toBe(hex(GREEN))
  })

  it('adds no object for a view whose create throws, and reports the error one time', () => {
    const view = makeView()
    view.create.mockImplementation(() => {
      throw BOOM
    })
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const onError = vi.fn()
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT, onError })

    expect(objectsOf(stage)).toHaveLength(0)
    expect(view.update).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(BOOM)
  })

  it('draws the next component after a view whose create throws', () => {
    const view = makeView()
    const create = view.create.getMockImplementation() as () => Sprite
    view.create.mockImplementationOnce(() => {
      throw BOOM
    })
    view.create.mockImplementation(create)
    const { screen } = makeHub(modelOf(entity(E1, RED), entity(E2, BLUE)))
    const onError = vi.fn()
    const stage = new Container()

    startRenderer({ port: screen, views: tableOf(view), stage, viewport: VIEWPORT, onError })

    expect(tintsOf(stage)).toEqual([hex(BLUE)])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('writes the error to console.error when there is no onError', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = makeView()
    view.create.mockImplementation(() => {
      throw BOOM
    })
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))

    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(BOOM)
  })
})

describe('startRenderer: reading only', () => {
  it('leaves a record with no input of the renderer', async () => {
    const { hub, editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })
    expect(hub.record()).toEqual([])

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    expect(hub.record().map((input) => input.source)).toEqual(['editor'])
  })
})

describe('startRenderer: stop', () => {
  it('removes the objects and the listener, and does not close the port', () => {
    const { hub, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const close = vi.spyOn(screen, 'close')
    const unsubscribed = vi.fn()
    const subscribe = screen.subscribe.bind(screen)
    const port: PortReader = {
      read: () => screen.read(),
      subscribe: (listener) => {
        const unsubscribe = subscribe(listener)
        return () => {
          unsubscribed()
          unsubscribe()
        }
      },
    }
    const stage = new Container()
    const renderer = startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const object = objectsOf(stage)[0]

    renderer.stop()

    expect(unsubscribed).toHaveBeenCalledTimes(1)
    expect(stage.children).toHaveLength(0)
    expect(object.destroyed).toBe(true)
    expect(close).not.toHaveBeenCalled()
    expect(hub.status).toBe('running')
  })

  it('does nothing for a second stop', () => {
    const { port, listenerCount } = fakePort(() => ({ store: modelOf(entity(E1, BLUE)) }))
    const stage = new Container()
    const sibling = new Container()
    stage.addChild(sibling)
    const renderer = startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const other = startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT })

    renderer.stop()
    renderer.stop()

    expect(listenerCount()).toBe(1)
    expect(stage.children).toHaveLength(2)
    expect(stage.children[0]).toBe(sibling)
    other.stop()
  })

  it('removes the listener one time for two stops', () => {
    const unsubscribed = vi.fn()
    const port: PortReader = {
      read: () => ({ store: modelOf(entity(E1, BLUE)) }),
      subscribe: () => unsubscribed,
    }
    const renderer = startRenderer({ port, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    renderer.stop()
    renderer.stop()

    expect(unsubscribed).toHaveBeenCalledTimes(1)
  })

  it('changes nothing after a stop from inside a different listener of the same port', () => {
    const view = makeView()
    let store = modelOf(entity(E1, BLUE))
    const { port, emit } = fakePort(() => ({ store }))
    // The first listener stops the renderer before the listener of the renderer runs.
    // eslint-disable-next-line prefer-const -- assigned after the listener that uses it
    let renderer: ReturnType<typeof startRenderer> | undefined
    port.subscribe(() => renderer?.stop())
    const stage = new Container()
    renderer = startRenderer({ port, views: tableOf(view), stage, viewport: VIEWPORT })
    expect(view.update).toHaveBeenCalledTimes(1)

    store = modelOf(entity(E1, RED), entity(E2, GREEN))
    emit(APPLIED)

    expect(view.update).toHaveBeenCalledTimes(1)
    expect(view.create).toHaveBeenCalledTimes(1)
    expect(stage.children).toHaveLength(0)
  })

  it('changes nothing and gives no error for an event after the stop', () => {
    const view = makeView()
    let store = modelOf(entity(E1, BLUE))
    const { port, emit } = fakePort(() => ({ store }))
    const stage = new Container()
    const renderer = startRenderer({ port, views: tableOf(view), stage, viewport: VIEWPORT })
    renderer.stop()

    store = modelOf(entity(E1, RED))

    expect(() => {
      emit(APPLIED)
    }).not.toThrow()
    expect(view.update).toHaveBeenCalledTimes(1)
    expect(stage.children).toHaveLength(0)
  })

  it('gives no error when the page destroyed the stage with its children', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const stage = new Container()
    const renderer = startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT })

    stage.destroy({ children: true })

    expect(() => {
      renderer.stop()
    }).not.toThrow()
  })

  it('gives no error for an event after the page destroyed the stage with its children', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const stage = new Container()
    const onError = vi.fn()
    startRenderer({ port: screen, views: tableOf(makeView()), stage, viewport: VIEWPORT, onError })
    stage.destroy({ children: true })

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    expect(onError).not.toHaveBeenCalled()
  })
})

describe('startRenderer: entityAt', () => {
  it('gives the entity and the component type of the top visible object', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2, RED)))
    const renderer = startRenderer({
      port: screen,
      views: tableOf(makeView()),
      stage: new Container(),
      viewport: VIEWPORT,
    })

    expect(renderer.entityAt(10, 10)).toEqual({ entity: E2, componentType: CLEAR_COLOR })
  })

  it('gives the object below when the top object is hidden', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE), entity(E2)))
    const renderer = startRenderer({
      port: screen,
      views: tableOf(makeView()),
      stage: new Container(),
      viewport: VIEWPORT,
    })

    expect(renderer.entityAt(10, 10)).toEqual({ entity: E1, componentType: CLEAR_COLOR })
  })

  it('gives no value when the only object is hidden', () => {
    const { screen } = makeHub(modelOf(entity(E1)))
    const renderer = startRenderer({
      port: screen,
      views: tableOf(makeView()),
      stage: new Container(),
      viewport: VIEWPORT,
    })

    expect(renderer.entityAt(10, 10)).toBeUndefined()
  })

  it('gives no value for a point outside each object', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const renderer = startRenderer({
      port: screen,
      views: tableOf(makeView()),
      stage: new Container(),
      viewport: VIEWPORT,
    })

    expect(renderer.entityAt(VIEWPORT.width + 10, 10)).toBeUndefined()
    expect(renderer.entityAt(10, VIEWPORT.height + 10)).toBeUndefined()
    expect(renderer.entityAt(-1, 10)).toBeUndefined()
  })

  it('gives no value after the stop', () => {
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))
    const renderer = startRenderer({
      port: screen,
      views: tableOf(makeView()),
      stage: new Container(),
      viewport: VIEWPORT,
    })
    expect(renderer.entityAt(10, 10)).toBeDefined()

    renderer.stop()

    expect(renderer.entityAt(10, 10)).toBeUndefined()
  })
})

describe('startRenderer: two renderers on one stage', () => {
  it('gives each renderer its own objects, and the stop of one leaves the other', async () => {
    const { editor, screen } = makeHub(modelOf(entity(E1, BLUE)))
    const listeners = { count: 0 }
    const port: Pick<Port, 'read' | 'subscribe'> = {
      read: () => screen.read(),
      subscribe: (listener) => {
        listeners.count += 1
        const unsubscribe = screen.subscribe(listener)
        return () => {
          listeners.count -= 1
          unsubscribe()
        }
      },
    }
    const stage = new Container()
    const first = startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    startRenderer({ port, views: tableOf(makeView()), stage, viewport: VIEWPORT })
    const firstObject = objectsOf(stage, 0)[0]
    const secondObject = objectsOf(stage, 1)[0]
    expect(firstObject).not.toBe(secondObject)
    expect(listeners.count).toBe(2)

    first.stop()

    expect(stage.children).toHaveLength(1)
    expect(firstObject.destroyed).toBe(true)
    expect(secondObject.destroyed).toBe(false)
    expect(listeners.count).toBe(1)
    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )
    expect(tintsOf(stage, 0)).toEqual([hex(RED)])
  })
})

describe('startRenderer: warnings', () => {
  const emptyNameModel = (...entities: Entity[]): Model => ({
    definitions: [
      {
        id: CLEAR_COLOR,
        label: 'Clear color',
        fields: [
          { id: COLOR_FIELD, label: 'Color', type: 'string' },
          { id: SECOND_FIELD, label: '???', type: 'string' },
        ],
      },
    ],
    entities,
  })
  const LINE = `wishem: the sidecar ClearColor.view.json: the label of the field ${SECOND_FIELD} of the component type ${CLEAR_COLOR} gives an empty name. The view does not get the field.`

  it('gives the view no prop for a field with an empty name, and warns one time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const component = { [COLOR_FIELD]: BLUE, [SECOND_FIELD]: RED }
    const { screen } = makeHub(emptyNameModel({ id: E1, components: { [CLEAR_COLOR]: component } }))
    const view = makeView()

    startRenderer({ port: screen, views: tableOf(view), stage: new Container(), viewport: VIEWPORT })

    expect(view.update.mock.calls[0][1]).toEqual({ color: BLUE })
    expect(warn.mock.calls).toEqual([[LINE]])
  })

  it('gives no new warning after an input that changes a value and keeps the definitions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const component = { [COLOR_FIELD]: BLUE }
    const { editor, screen } = makeHub(emptyNameModel({ id: E1, components: { [CLEAR_COLOR]: component } }))
    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns for a definition that has no component and a view', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { screen } = makeHub(emptyNameModel())

    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    expect(warn.mock.calls).toEqual([[LINE]])
  })

  it('does not warn for a model with no field with an empty name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { screen } = makeHub(modelOf(entity(E1, BLUE)))

    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    expect(warn).not.toHaveBeenCalled()
  })

  it('writes the warning again for a second renderer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { screen } = makeHub(emptyNameModel())

    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT }).stop()
    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    expect(warn.mock.calls).toEqual([[LINE], [LINE]])
  })

  it('writes the warning again after a model that has no empty name, then one that has', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { editor, screen } = makeHub(emptyNameModel())
    startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

    await editor.submit(storeInputs().replaceModel(modelOf()))
    await editor.submit(storeInputs().replaceModel(emptyNameModel()))

    expect(warn.mock.calls).toEqual([[LINE], [LINE]])
  })

  describe('with two fields that have an empty name', () => {
    const THIRD_FIELD = 'fld_2a1c2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5f'
    const twoEmptyModel = (...ids: string[]): Model => ({
      definitions: [
        {
          id: CLEAR_COLOR,
          label: 'Clear color',
          fields: [
            { id: COLOR_FIELD, label: 'Color', type: 'string' },
            ...ids.map((id) => ({ id, label: '???', type: 'string' as const })),
          ],
        },
      ],
      entities: [entity(E1, BLUE)],
    })
    const lineOf = (field: string): string =>
      `wishem: the sidecar ClearColor.view.json: the label of the field ${field} of the component type ${CLEAR_COLOR} gives an empty name. The view does not get the field.`

    it('writes one line for each field, in the order of the fields', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { screen } = makeHub(twoEmptyModel(SECOND_FIELD, THIRD_FIELD))

      startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

      expect(warn.mock.calls).toEqual([[lineOf(SECOND_FIELD)], [lineOf(THIRD_FIELD)]])
    })

    it('gives no new warning after an input that keeps the definitions', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { editor, screen } = makeHub(twoEmptyModel(SECOND_FIELD, THIRD_FIELD))
      startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

      await editor.submit(
        storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
      )

      expect(warn).toHaveBeenCalledTimes(2)
    })

    it('writes the lines again when other fields have an empty name, with the same count', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { editor, screen } = makeHub(twoEmptyModel(SECOND_FIELD))
      startRenderer({ port: screen, views: tableOf(makeView()), stage: new Container(), viewport: VIEWPORT })

      await editor.submit(storeInputs().replaceModel(twoEmptyModel(THIRD_FIELD)))

      expect(warn.mock.calls).toEqual([[lineOf(SECOND_FIELD)], [lineOf(THIRD_FIELD)]])
    })
  })
})

describe('startRenderer: warnings through a link', () => {
  const MISSING_TYPE = 'ct_8d2b3a0f-2c58-4e1b-8f62-7d3a8b2c1e46'
  const LINE = `wishem: the sidecar ClearColor.view.json names the component type ${MISSING_TYPE}, which no definition has. No view is drawn for it.`

  it('warns one time for a component type with no definition, and not again after an input or the new definition', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const views = collectViews(
      { './ClearColor.view.json': { default: { kind: 'pixi', componentType: MISSING_TYPE } } },
      { './ClearColor.ts': { default: makeView() } },
    )
    const model = modelOf(entity(E1, BLUE))
    const { hub, editor } = makeHub(model)
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [{ id: 'remote-screen', kind: 'output' }])
    const stage = new Container()

    startRenderer({ port: link.ports['remote-screen'], views, stage, viewport: VIEWPORT })

    expect(warn.mock.calls).toEqual([[LINE]])
    expect(objectsOf(stage)).toHaveLength(0)

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: RED }),
    )
    await vi.waitFor(() => {
      expect(link.ports['remote-screen'].read().store).not.toBe(model)
    })
    expect(warn).toHaveBeenCalledTimes(1)

    const defined: Model = {
      definitions: [...model.definitions, { id: MISSING_TYPE, label: 'Missing', fields: [] }],
      entities: [{ id: E1, components: { [MISSING_TYPE]: {} } }],
    }
    await editor.submit(storeInputs().replaceModel(defined))
    await vi.waitFor(() => {
      expect(objectsOf(stage)).toHaveLength(1)
    })
    expect(warn).toHaveBeenCalledTimes(1)
    link.close()
  })

  it('warns one time for two labels with one name, and not again after an input or a model without the second field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const model: Model = {
      definitions: [
        {
          id: CLEAR_COLOR,
          label: 'Clear color',
          fields: [
            { id: COLOR_FIELD, label: 'Color', type: 'string' },
            { id: SECOND_FIELD, label: 'color', type: 'string' },
          ],
        },
      ],
      entities: [{ id: E1, components: { [CLEAR_COLOR]: { [COLOR_FIELD]: BLUE, [SECOND_FIELD]: RED } } }],
    }
    const { hub, editor } = makeHub(model)
    const [clientChannel, hubChannel] = createChannelPair()
    serveLink(hub, hubChannel)
    const link = await openLink(clientChannel, [{ id: 'remote-screen', kind: 'output' }])
    const view = makeView()

    startRenderer({
      port: link.ports['remote-screen'],
      views: tableOf(view),
      stage: new Container(),
      viewport: VIEWPORT,
    })

    expect(warn.mock.calls).toEqual([
      [
        `wishem: the sidecar ClearColor.view.json: the fields ${COLOR_FIELD} and ${SECOND_FIELD} of the component type ${CLEAR_COLOR} give the same name "color". The prop has the value of the first field.`,
      ],
    ])
    expect(view.update.mock.calls.at(-1)?.[1]).toEqual({ color: BLUE })

    await editor.submit(
      storeInputs().setField({ entity: E1, componentType: CLEAR_COLOR, field: COLOR_FIELD, value: GREEN }),
    )
    await vi.waitFor(() => {
      expect(view.update.mock.calls.at(-1)?.[1]).toEqual({ color: GREEN })
    })
    expect(warn).toHaveBeenCalledTimes(1)

    await editor.submit(storeInputs().replaceModel(modelOf(entity(E1, RED))))
    await vi.waitFor(() => {
      expect(view.update.mock.calls.at(-1)?.[1]).toEqual({ color: RED })
    })
    expect(warn).toHaveBeenCalledTimes(1)
    link.close()
  })
})
