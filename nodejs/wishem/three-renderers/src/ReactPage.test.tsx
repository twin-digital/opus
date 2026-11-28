import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectViews } from '@thrashplay/wishem-renderer-react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReactPage } from './ReactPage.js'
import sidecar from './views/ClearColor.view.json'
import * as clearColor from './views/ClearColor.js'

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

const readSample = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../sample-product/model', path), 'utf8'))
const definition = readSample('definitions/ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512.json')
const entityId = 'e_99969ed3-f499-4dbb-bf6d-958db4542884'
const typeId = 'ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512'
const fieldId = 'fld_694d6cb2-97e8-444e-961e-aa76744837fb'

/** The store of the welcome message, with one entity that has the component Color. */
const storeWith = (color: string) => ({
  definitions: [definition],
  entities: [{ id: entityId, components: { [typeId]: { [fieldId]: color } } }],
})

const views = collectViews(
  { './views/ClearColor.view.json': { default: sidecar } },
  { './views/ClearColor.tsx': clearColor },
)

describe('ReactPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    FakeWebSocket.instances = []
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const draw = async () => {
    await act(async () => {
      root.render(
        <ReactPage
          url='ws://example.test/link'
          createSocket={(address) => new FakeWebSocket(address)}
          views={views}
          firstDelayMs={1}
          maxDelayMs={1}
        />,
      )
      await Promise.resolve()
    })
  }

  const socket = (index: number) => {
    const found = FakeWebSocket.instances.at(index)
    if (!found) {
      throw new Error(`no socket ${String(index)}`)
    }
    return found
  }

  const welcome = async (index: number, color: string) => {
    await act(async () => {
      socket(index).welcome(storeWith(color))
      await Promise.resolve()
    })
  }

  const waitForSocket = async (index: number) => {
    await act(async () => {
      for (let i = 0; i < 100 && FakeWebSocket.instances.length <= index; i += 1) {
        await new Promise((r) => setTimeout(r, 5))
      }
    })
  }

  const status = () => container.querySelector('[role="status"]')?.textContent
  const fill = () => container.querySelector<HTMLElement>('[data-wishem-entity] > div')

  it('has a box with the role img and a label, and a status line with the role status', async () => {
    await draw()

    const box = container.querySelector('[role="img"]')
    expect(box?.getAttribute('aria-label')).toBe('The color of the construct')
    expect(container.querySelector('p[role="status"]')).not.toBeNull()
  })

  it('opens the link at the given address with one output subsystem and no input subsystem', async () => {
    await draw()
    await act(async () => {
      await Promise.resolve()
    })

    expect(socket(0).url).toBe('ws://example.test/link')
    const hello = JSON.parse(socket(0).sent[0] ?? '{}') as { subsystems: { id: string; kind: string }[] }
    expect(hello.subsystems).toHaveLength(1)
    expect(hello.subsystems[0]?.kind).toBe('output')
    expect(hello.subsystems[0]?.id).toMatch(/^react-page-[0-9a-f]{16}$/)
  })

  it('says that the page connects before the first link, and draws nothing', async () => {
    await draw()

    expect(status()).toBe('Connecting to the construct.')
    expect(fill()).toBeNull()
  })

  it('shows the number of the link and draws the color after the welcome message', async () => {
    await draw()
    await welcome(0, '#1d4ed8')

    expect(status()).toBe('Connected (link 1).')
    expect(fill()?.style.backgroundColor).toBe('rgb(29, 78, 216)')
  })

  it('keeps the last picture and says so while the link is down', async () => {
    await draw()
    await welcome(0, '#b91c1c')

    await act(async () => {
      socket(0).emit('close')
      await Promise.resolve()
    })

    expect(status()).toBe('The construct is not reachable. The page tries again.')
    expect(fill()?.style.backgroundColor).toBe('rgb(185, 28, 28)')
  })

  it('draws the state of a new link with the next number and no reload', async () => {
    await draw()
    await welcome(0, '#1d4ed8')
    await act(async () => {
      socket(0).emit('close')
      await Promise.resolve()
    })
    await waitForSocket(1)

    await welcome(1, '#15803d')

    expect(status()).toBe('Connected (link 2).')
    expect(fill()?.style.backgroundColor).toBe('rgb(21, 128, 61)')
  })

  it('says that the construct is not reachable when the first attempt fails', async () => {
    await draw()
    await act(async () => {
      socket(0).emit('error')
      socket(0).emit('close')
      await Promise.resolve()
    })

    expect(status()).toBe('The construct is not reachable. The page tries again.')
  })

  it('closes the link when the page unmounts', async () => {
    await draw()
    await welcome(0, '#1d4ed8')

    act(() => {
      root.unmount()
    })

    expect(socket(0).readyState).toBe(3)
    root = createRoot(container)
  })
})
