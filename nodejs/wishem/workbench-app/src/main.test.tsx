import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  private readonly handlers = new Map<string, ((event: Event) => void)[]>()

  constructor() {
    FakeEventSource.instances.push(this)
  }

  addEventListener = (type: string, handler: (event: Event) => void) => {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }

  close = () => undefined

  emit = (type: string, data: string) => {
    this.handlers.get(type)?.forEach((handler) => {
      handler(new MessageEvent(type, { data }))
    })
  }
}

const modelFolder = resolve(import.meta.dirname, '../../workbench/model')
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(modelFolder, path), 'utf8'))
const baseSnapshot = JSON.stringify({
  definitions: [readJson('definitions/ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34.json')],
  entities: (readJson('state.json') as { entities: unknown[] }).entities,
})

describe('workbench page', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = '<div id="root"></div>'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the zero state in a main element and no app bar before a snapshot', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(document.querySelector('main')?.textContent).toContain('Nothing to show yet.')
    })
    expect(document.querySelector('header')).toBeNull()
  })

  it('shows the app bar after a snapshot of the base workbench model', async () => {
    await import('./main.js')
    await vi.waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1)
    })
    FakeEventSource.instances[0]?.emit('snapshot', baseSnapshot)
    await vi.waitFor(() => {
      expect(document.querySelector('header h1')?.textContent).toBe('Wishem.')
    })
    expect(document.querySelector('main')?.textContent).toContain('Nothing to show yet.')
  })
})
