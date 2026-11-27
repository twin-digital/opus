import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    vi.resetModules()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
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
})
