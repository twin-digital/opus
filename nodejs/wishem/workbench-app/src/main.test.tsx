import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ViewProps, ViewTools } from '@thrashplay/wishem-renderer-react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  private readonly handlers = new Map<string, ((event: { data?: unknown }) => void)[]>()

  readonly url: string
  readyState = 0
  readonly sent: string[] = []

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.emit('open')
    })
  }

  addEventListener = (type: string, handler: (event: { data?: unknown }) => void) => {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }

  send = (data: string) => {
    this.sent.push(data)
  }

  close = () => {
    this.readyState = 3
  }

  emit = (type: string, data?: string) => {
    this.handlers.get(type)?.forEach((handler) => {
      handler({ data })
    })
  }

  welcome = (store: unknown) => {
    this.emit('message', JSON.stringify({ t: 'welcome', protocol: 1, status: 'running', seq: 0, state: { store } }))
  }
}

const modelFolder = resolve(import.meta.dirname, '../../workbench/model')
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(modelFolder, path), 'utf8'))
const baseModel = {
  definitions: [readJson('definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json')],
  entities: (readJson('state.json') as { entities: unknown[] }).entities,
}

describe('workbench page', () => {
  let fetchMock: Mock<() => Promise<Response>>

  beforeEach(() => {
    vi.resetModules()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 404 })))
    vi.stubGlobal('fetch', fetchMock)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = '<div id="root"></div>'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./views.js')
    vi.restoreAllMocks()
  })

  it('shows the zero state in a main element and no app bar before the welcome message', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(document.querySelector('main')?.textContent).toContain('Nothing to show yet.')
    })
    expect(document.querySelector('header')).toBeNull()
  })

  it('shows the app bar after the welcome message with the base workbench model', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.welcome(baseModel)
    await vi.waitFor(() => {
      expect(document.querySelector('header h1')?.textContent).toBe('Wishem.')
    })
    expect(document.querySelector('main')?.textContent).toContain('Nothing to show yet.')
  })

  it('draws the new title after a second welcome message on a new link', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.welcome(baseModel)
    await vi.waitFor(() => {
      expect(document.querySelector('header h1')?.textContent).toBe('Wishem.')
    })
    FakeWebSocket.instances[0]?.emit('close')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
    const entities = baseModel.entities as { components: Record<string, Record<string, unknown>> }[]
    const renamed = entities.map((entity) => ({
      ...entity,
      components: {
        ...entity.components,
        'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34': { 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62': 'Second' },
      },
    }))
    FakeWebSocket.instances[1]?.welcome({ ...baseModel, entities: renamed })
    await vi.waitFor(() => {
      expect(document.querySelector('header h1')?.textContent).toBe('Second.')
    })
  })

  it('opens the new link with the same two subsystem IDs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.welcome(baseModel)
    await vi.waitFor(() => {
      expect(document.querySelector('header h1')?.textContent).toBe('Wishem.')
    })
    FakeWebSocket.instances[0]?.emit('close')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
    const ids = FakeWebSocket.instances.map((socket) =>
      (JSON.parse(socket.sent[0] ?? '{}') as { subsystems: { id: string }[] }).subsystems.map(({ id }) => id),
    )
    expect(ids[1]).toEqual(ids[0])
    expect(ids[0]).toHaveLength(2)
  })

  it('gives the input port of the new link to the views', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const captured: { tools?: ViewTools<{ title: string }> } = {}
    const latest = () => captured.tools
    vi.doMock('./views.js', async () => {
      const { collectAppViews } = await vi.importActual<typeof import('./views.js')>('./views.js')
      const table = collectAppViews()
      const Capture = (props: ViewProps) => {
        captured.tools = props.wishem
        return null
      }
      return {
        collectAppViews: () => new Map([...table].map(([id, entry]) => [id, { ...entry, view: Capture }] as const)),
      }
    })
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.welcome(baseModel)
    FakeWebSocket.instances[0]?.emit('close')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
    const second = FakeWebSocket.instances[1]
    captured.tools = undefined
    second.welcome(baseModel)
    await vi.waitFor(() => {
      expect(latest()).toBeDefined()
    })
    const sentBefore = second.sent.length
    void latest()?.setField('title', 'Renamed')
    await vi.waitFor(() => {
      expect(second.sent.length).toBeGreaterThan(sentBefore)
    })
    const hello = JSON.parse(second.sent[0]) as { subsystems: { id: string; kind: string }[] }
    const inputId = hello.subsystems.find(({ kind }) => kind === 'input')?.id
    expect(inputId).toMatch(/^page-[0-9a-f]+-input$/)
    const messages = second.sent.slice(sentBefore).map((text) => JSON.parse(text) as { t?: string; subsystem?: string })
    expect(messages.filter(({ t }) => t === 'submit').map(({ subsystem }) => subsystem)).toContain(inputId)
    expect(FakeWebSocket.instances[0]?.sent).toHaveLength(1)
  })

  it('opens the link at the address of the page', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    expect(FakeWebSocket.instances[0]?.url).toBe(`ws://${window.location.host}/link`)
  })

  it('writes the error and draws no view when a view file is not correct', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.doMock('./views.js', async () => {
      const { ViewCollectionError } = await import('@thrashplay/wishem-renderer-react')
      return {
        collectAppViews: () => {
          throw new ViewCollectionError('wishem: the sidecar Bad.view.json has no view file Bad.tsx.', [
            'Bad.view.json',
          ])
        },
      }
    })

    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.welcome(baseModel)
    await vi.waitFor(() => {
      expect(document.querySelector('main')?.textContent).toContain('Nothing to show yet.')
    })

    expect(error).toHaveBeenCalledExactlyOnceWith('wishem: the sidecar Bad.view.json has no view file Bad.tsx.')
    expect(document.querySelector('header')).toBeNull()
  })

  it('throws an error that is not a view collection error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.doMock('./views.js', () => ({
      collectAppViews: () => {
        throw new Error('boom')
      },
    }))

    await expect(import('./main.js')).rejects.toThrow('boom')

    expect(error).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('loads the product views before the first render', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    expect(fetchMock).toHaveBeenCalledWith('/@wishem/product-views.json')
  })

  it('shows the run area when the workbench has a construct list, with views that are not correct', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{"views":3}', { status: 200 })))
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    FakeWebSocket.instances[0]?.emit(
      'message',
      JSON.stringify({
        t: 'welcome',
        protocol: 1,
        status: 'running',
        seq: 0,
        state: { store: baseModel, constructs: { constructs: {} } },
      }),
    )
    await vi.waitFor(() => {
      expect(document.querySelector('aside[aria-label="Run"]')).not.toBeNull()
    })
    expect(document.querySelector('[role="toolbar"]')).not.toBeNull()
  })
})
