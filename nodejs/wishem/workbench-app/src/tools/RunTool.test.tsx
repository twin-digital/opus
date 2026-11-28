import type { Model } from '@thrashplay/wishem-core'
import { createStore } from '@thrashplay/wishem-core'
import {
  CONSTRUCT_MANAGER_ID,
  constructInputs,
  createConstructList,
  type ReportPayload,
} from '@thrashplay/wishem-construct-manager'
import { createHub, type Hub, type Input, type Port, type SubmitResult } from '@thrashplay/wishem-hub'
import type { InputPort, ViewTable } from '@thrashplay/wishem-renderer-react'
import { act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductViews } from './product-views.js'
import { RunTool } from './RunTool.js'

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

const LINK = 'ws://127.0.0.1:4000/link'
const TYPE = 'ct_color'
const FIELD = 'fld_color'
const model: Model = {
  definitions: [{ id: TYPE, label: 'Color', fields: [{ id: FIELD, label: 'color', type: 'string' }] }],
  entities: [{ id: 'e_1', components: { [TYPE]: { [FIELD]: '#1d4ed8' } } }],
}
const ColorView: ComponentType<{ color?: string }> = ({ color }) => <p>Color {color}</p>
const views: ViewTable = new Map([
  [TYPE, { sidecar: 'Color.view.json', componentType: TYPE, view: ColorView as never }],
])
const withViews: ProductViews = { views }
const noViews: ProductViews = { views: new Map() }

const time = (ticks: number, running: boolean, stepMs?: number) => ({
  now: ticks * 50,
  ticks,
  running,
  ...(stepMs === undefined ? {} : { stepMs }),
})

describe('RunTool', () => {
  let container: HTMLDivElement
  let root: Root
  let hub: Hub
  let output: Port
  let input: Port
  let manager: Port

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    hub = createHub({ subsystems: [createStore(), createConstructList()] })
    hub.start()
    output = hub.attach({ id: 'screen', kind: 'output' })
    input = hub.attach({ id: 'screen-input', kind: 'input' })
    manager = hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
  })

  afterEach(() => {
    vi.useRealTimers()
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const draw = (inputPort: InputPort | null = input, productViews = withViews) => {
    act(() => {
      root.render(<RunTool port={output} input={inputPort ?? undefined} productViews={productViews} />)
    })
  }
  const settle = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  const report = async (payload: Partial<ReportPayload> & Pick<ReportPayload, 'status'>) => {
    await act(async () => {
      await manager.submit(constructInputs.report({ construct: 'play', ...payload }))
    })
  }
  /** Starts `play` and reports it as running on the link. */
  const running = async (timeState: 'running' | 'paused' = 'running') => {
    await act(async () => {
      await input.submit(constructInputs.start('play'))
    })
    await report({ status: 'running', link: LINK, time: timeState })
    await settle()
  }
  /** Reports the pass of the last input of the page as done. */
  const ack = async (timeState: 'running' | 'paused') => {
    const seq = lastInputs().at(-1)?.seq ?? 0
    await report({ status: 'running', link: LINK, time: timeState, lastSend: { seq, result: { ok: true, seq } } })
    await settle()
  }
  const welcome = async (stageTime?: ReturnType<typeof time>) => {
    FakeWebSocket.instances.at(-1)?.welcome({ store: model, ...(stageTime ? { time: stageTime } : {}) })
    await settle()
  }
  const button = (name: string) =>
    Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === name,
    ) as HTMLButtonElement
  const press = async (name: string) => {
    await act(async () => {
      button(name).click()
      await Promise.resolve()
    })
    await settle()
  }
  const lastInputs = () => hub.record().filter((item) => item.source === 'screen-input')
  const alertText = () => container.querySelector('[role="alert"]')?.textContent
  const stage = () => container.querySelector('section[aria-label="Stage"]')

  it('shows the toolbar and a Run button that is enabled with no entry', () => {
    draw()
    expect(container.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Product controls')
    expect(button('Run').getAttribute('aria-disabled')).toBeNull()
    expect(button('Pause').getAttribute('aria-disabled')).toBe('true')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Not running')
  })

  it('sends constructs/start through the input port when Run is pressed', async () => {
    draw()
    await press('Run')
    const [sent] = lastInputs()
    expect(sent).toMatchObject({ type: 'constructs/start', payload: { construct: 'play' } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Starting')
  })

  it('sends constructs/stop when Stop is pressed', async () => {
    draw()
    await running()
    await press('Stop')
    expect(lastInputs().at(-1)).toMatchObject({ type: 'constructs/stop', payload: { construct: 'play' } })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Stopped')
    expect(button('Run')).toBeDefined()
  })

  it('sends constructs/stop and then constructs/start for Run after a failure', async () => {
    draw()
    await act(async () => {
      await input.submit(constructInputs.start('play'))
    })
    await report({ status: 'failed', message: 'Two behaviors have the ID a.' })
    const before = lastInputs().length
    expect(alertText()).toBe('Two behaviors have the ID a.')
    await press('Run')
    expect(
      lastInputs()
        .slice(before)
        .map(({ type }) => type),
    ).toEqual(['constructs/stop', 'constructs/start'])
  })

  it('sends time/set-running false for Pause and true for Resume', async () => {
    draw()
    await running()
    await press('Pause')
    expect(lastInputs().at(-1)).toMatchObject({
      type: 'constructs/send',
      payload: { construct: 'play', input: { type: 'time/set-running', payload: { running: false } } },
    })
    await ack('paused')
    await press('Resume')
    expect(lastInputs().at(-1)).toMatchObject({
      payload: { input: { type: 'time/set-running', payload: { running: true } } },
    })
  })

  it('sends time/advance with the step length of the part time', async () => {
    draw()
    await running('paused')
    await welcome(time(3, false, 20))
    await press('Step')
    expect(lastInputs().at(-1)).toMatchObject({
      payload: { construct: 'play', input: { type: 'time/advance', payload: { ms: 20 } } },
    })
  })

  it('sends time/advance of 50 milliseconds when the part time has no step length', async () => {
    draw()
    await running('paused')
    await welcome(time(4, false))
    await press('Step')
    expect(lastInputs().at(-1)).toMatchObject({ payload: { input: { type: 'time/advance', payload: { ms: 50 } } } })
  })

  it('sends constructs/rewind with one tick for Step back, and shows the readout', async () => {
    draw()
    await running('paused')
    await welcome(time(42, false))
    expect(container.textContent).toContain('Tick 42')
    expect(container.textContent).toContain('2.10 s')
    await press('Step back')
    expect(lastInputs().at(-1)).toMatchObject({ type: 'constructs/rewind', payload: { construct: 'play', ticks: 1 } })
  })

  it('disables each control with no input port', async () => {
    draw(null)
    await running()
    draw(null)
    for (const name of ['Stop', 'Pause', 'Step', 'Step back']) {
      expect(button(name).getAttribute('aria-disabled')).toBe('true')
    }
  })

  it('shows the refusal of the workbench, and the next accepted control removes it', async () => {
    const refusing: InputPort = {
      submit: (): Promise<SubmitResult> => Promise.resolve({ ok: false, reason: 'not-running', problems: [] }),
    }
    draw(refusing)
    await press('Run')
    expect(alertText()).toBe('Not done. The workbench does not run. Start it, and try again.')
    draw(input)
    await press('Run')
    expect(alertText()).toBeUndefined()
  })

  it('shows a line with the name of the control for a pass that is not ok', async () => {
    draw()
    await running()
    await press('Pause')
    const seq = lastInputs().at(-1)?.seq ?? 0
    expect(button('Pause').getAttribute('aria-busy')).toBe('true')
    await report({
      status: 'running',
      link: LINK,
      time: 'running',
      lastSend: { seq, result: { ok: false, reason: 'invalid', problems: [{ message: 'The clock refused.' }] } },
    })
    await settle()
    expect(alertText()).toBe('Pause was not done. The clock refused.')
    expect(button('Pause').getAttribute('aria-busy')).toBeNull()
  })

  it('ends a control with no line when the result of its sequence number comes', async () => {
    draw()
    await running()
    await press('Pause')
    const seq = lastInputs().at(-1)?.seq ?? 0
    await report({ status: 'running', link: LINK, time: 'paused', lastSend: { seq, result: { ok: true, seq } } })
    await settle()
    expect(alertText()).toBeUndefined()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('waits for the result at most 5 seconds', async () => {
    draw()
    await running()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => {
      button('Pause').click()
      await vi.advanceTimersByTimeAsync(4900)
    })
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(alertText()).toBeUndefined()
  })

  it('shows the stage zero states', async () => {
    draw()
    expect(stage()?.textContent).toContain('Not running. Press Run to start the product.')
    await running()
    expect(stage()?.textContent).toContain('Connecting to the product.')
    await welcome(time(0, false))
    expect(stage()?.textContent).toContain('Color #1d4ed8')
    draw(input, noViews)
    expect(stage()?.textContent).toContain('The product has no React views.')
    draw(input, { views, error: 'The views of the product are not correct.' })
    expect(stage()?.textContent).toContain('The views of the product are not correct.')
  })

  it('shows connecting for a running entry with no link', async () => {
    draw()
    await act(async () => {
      await input.submit(constructInputs.start('play'))
    })
    await report({ status: 'running' })
    await settle()
    expect(stage()?.textContent).toContain('Connecting to the product.')
    expect(stage()?.textContent).not.toContain('Not running.')
  })

  it('keeps the picture and shows a note when the stage link is down', async () => {
    draw()
    await running()
    await welcome(time(0, false))
    FakeWebSocket.instances.at(-1)?.emit('close')
    await settle()
    expect(stage()?.textContent).toContain('Color #1d4ed8')
    expect(stage()?.textContent).toContain('The product is not reachable. The page tries again.')
  })

  it('gives the views of the stage no input port', async () => {
    draw()
    await running()
    await welcome(time(0, false))
    expect(lastInputs().every(({ type }) => type.startsWith('constructs/'))).toBe(true)
    const hello = JSON.parse(FakeWebSocket.instances.at(-1)?.sent[0] ?? '{}') as { subsystems: { kind: string }[] }
    expect(hello.subsystems.map(({ kind }) => kind)).toEqual(['output'])
  })

  it('does not call the input port when a control is disabled', async () => {
    const submit = vi.fn<(message: Input) => Promise<SubmitResult>>()
    draw({ submit })
    await press('Pause')
    await press('Step')
    expect(submit).not.toHaveBeenCalled()
  })
})
