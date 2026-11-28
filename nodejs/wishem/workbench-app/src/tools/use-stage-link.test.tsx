import type { ConstructEntry } from '@thrashplay/wishem-construct-manager'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStageLink, type StageState } from './use-stage-link.js'

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

  welcome = (state: Record<string, unknown>) => {
    this.emit('message', JSON.stringify({ t: 'welcome', protocol: 1, status: 'running', seq: 0, state }))
  }
}

const entry = (patch: Partial<ConstructEntry> = {}): ConstructEntry => ({
  want: 'running',
  startTime: 'running',
  startSeq: 1,
  status: 'running',
  link: 'ws://127.0.0.1:4000/link',
  time: 'running',
  ...patch,
})

describe('useStageLink', () => {
  let container: HTMLDivElement
  let root: Root
  let latest: StageState | undefined

  const Probe = ({ value }: { value: ConstructEntry | undefined }) => {
    latest = useStageLink('play', value)
    return null
  }
  const draw = (value: ConstructEntry | undefined) => {
    act(() => {
      root.render(<Probe value={value} />)
    })
  }
  const settle = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    FakeWebSocket.instances = []
    latest = undefined
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens no link while there is no entry or the entry does not run', () => {
    draw(undefined)
    expect(latest).toEqual({ state: 'off' })
    draw(entry({ status: 'pending', link: undefined, time: undefined }))
    expect(latest).toEqual({ state: 'off' })
    draw(entry({ status: 'stopped', link: undefined }))
    expect(latest).toEqual({ state: 'off' })
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('opens the path of the construct with one output subsystem, and is connected after the welcome', async () => {
    draw(entry())
    expect(latest?.state).toBe('connecting')
    await settle()
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe(`ws://${window.location.host}/constructs/play/link`)
    const hello = JSON.parse(socket.sent[0] ?? '{}') as { subsystems: { id: string; kind: string }[] }
    expect(hello.subsystems).toHaveLength(1)
    expect(hello.subsystems[0]?.kind).toBe('output')
    expect(hello.subsystems[0]?.id).toMatch(/^page-[0-9a-f]+-stage$/)
    socket.welcome({ time: { now: 0, ticks: 0, running: true } })
    await settle()
    expect(latest?.state).toBe('connected')
    const port = latest?.state === 'connected' ? latest.port : undefined
    expect(port?.read().time).toEqual({ now: 0, ticks: 0, running: true })
  })

  it('opens a new link when the link or the start number changes', async () => {
    draw(entry())
    await settle()
    FakeWebSocket.instances[0].welcome({})
    await settle()
    draw(entry())
    await settle()
    expect(FakeWebSocket.instances).toHaveLength(1)
    draw(entry({ link: 'ws://127.0.0.1:4001/link' }))
    await settle()
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(latest?.state).toBe('connecting')
    draw(entry({ link: 'ws://127.0.0.1:4001/link', startSeq: 9 }))
    await settle()
    expect(FakeWebSocket.instances).toHaveLength(3)
  })

  it('closes the link and is off when the entry stops', async () => {
    draw(entry())
    await settle()
    const socket = FakeWebSocket.instances[0]
    socket.welcome({})
    await settle()
    draw(entry({ status: 'stopped', link: undefined }))
    await settle()
    expect(latest).toEqual({ state: 'off' })
    expect(socket.readyState).toBe(3)
  })

  it('keeps the port when the state is down', async () => {
    draw(entry())
    await settle()
    const socket = FakeWebSocket.instances[0]
    socket.welcome({ time: { now: 5, ticks: 1, running: false } })
    await settle()
    const port = latest?.state === 'connected' ? latest.port : undefined
    expect(port).toBeDefined()
    socket.emit('close')
    await settle()
    expect(latest?.state).toBe('down')
    expect(latest?.state === 'down' ? latest.port : undefined).toBe(port)
  })
})
