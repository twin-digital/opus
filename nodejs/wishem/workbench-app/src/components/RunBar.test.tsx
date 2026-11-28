import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunBar, type RunBarProps } from './RunBar.js'
import type { RunControl, RunState } from './run-bar-types.js'

const all: RunControl[] = ['run', 'stop', 'pause', 'resume', 'step', 'back']

const state = (patch: Partial<RunState> = {}): RunState => ({
  status: 'Paused',
  enabled: new Set(all),
  readout: { ticks: 42, seconds: '2.10' },
  ...patch,
})

describe('RunBar', () => {
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
  })

  const draw = (props: Partial<RunBarProps> = {}) => {
    act(() => {
      root.render(<RunBar state={state()} {...props} />)
    })
  }
  const toolbar = () => container.querySelector('[role="toolbar"]') as HTMLElement
  const buttons = () => Array.from(container.querySelectorAll('button'))
  const labels = () => buttons().map((b) => b.textContent)
  const press = (key: string) => {
    act(() => {
      ;(document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    })
  }

  it('is a toolbar named Product controls', () => {
    draw()
    expect(toolbar().getAttribute('aria-label')).toBe('Product controls')
  })

  it('shows the label Product, the status, the four buttons, then the readout, in this order', () => {
    draw()
    const texts = Array.from(toolbar().querySelectorAll('span, button')).map((e) => e.textContent)
    expect(texts).toEqual(['Product', 'Paused', 'Stop', 'Resume', 'Step', 'Step back', 'Tick 42', '2.10 s'])
  })

  it('shows Run and Pause when the status is not Running or Paused', () => {
    draw({ state: state({ status: 'Not running', readout: undefined }) })
    expect(labels()).toEqual(['Run', 'Pause', 'Step', 'Step back'])
  })

  it('shows Stop and Pause when running', () => {
    draw({ state: state({ status: 'Running' }) })
    expect(labels()).toEqual(['Stop', 'Pause', 'Step', 'Step back'])
  })

  it('draws Run and Resume as maker buttons, and the others as neutral buttons', () => {
    draw({ state: state({ status: 'Not running' }) })
    expect(buttons()[0]?.classList.contains('bg-maker')).toBe(true)
    draw()
    expect(buttons()[1]?.classList.contains('bg-maker')).toBe(true)
    for (const index of [0, 2, 3]) {
      expect(buttons()[index]?.classList.contains('bg-maker')).toBe(false)
    }
  })

  it('shows the status in a status role', () => {
    draw()
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toBe('Paused')
    expect(status?.classList.contains('font-mono')).toBe(true)
  })

  it.each([
    ['Running', 'text-success-text'],
    ['Paused', 'text-warning-text'],
    ['Failed', 'text-danger-text'],
    ['Not running', 'text-fg-muted'],
    ['Starting', 'text-fg-muted'],
    ['Stopped', 'text-fg-muted'],
  ] as const)('shows the status %s in %s', (status, name) => {
    draw({ state: state({ status }) })
    expect(container.querySelector('[role="status"]')?.classList.contains(name)).toBe(true)
  })

  it('shows the readout as mono labels in fg-muted', () => {
    draw()
    const readout = Array.from(toolbar().querySelectorAll('span')).filter((s) => /Tick|\ss$/.test(s.textContent))
    expect(readout.map((s) => s.textContent)).toEqual(['Tick 42', '2.10 s'])
    for (const span of readout) {
      expect(span.classList.contains('font-mono')).toBe(true)
      expect(span.classList.contains('text-fg-muted')).toBe(true)
      expect(span.classList.contains('uppercase')).toBe(true)
    }
  })

  it('shows no readout when the state has none', () => {
    draw({ state: state({ readout: undefined }) })
    expect(toolbar().textContent).not.toContain('Tick')
  })

  it('marks a button that is not enabled with aria-disabled', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['stop', 'resume']) }) })
    expect(buttons().map((b) => b.getAttribute('aria-disabled'))).toEqual([null, null, 'true', 'true'])
  })

  it('calls onControl with the control of the button', () => {
    const onControl = vi.fn()
    draw({ onControl })
    act(() => {
      buttons()[3]?.click()
    })
    expect(onControl).toHaveBeenCalledWith('back')
  })

  it('does not call onControl for a disabled button', () => {
    const onControl = vi.fn()
    draw({ onControl, state: state({ enabled: new Set<RunControl>(['stop']) }) })
    act(() => {
      buttons()[2]?.click()
    })
    expect(onControl).not.toHaveBeenCalled()
  })

  it('marks the busy control', () => {
    draw({ busy: 'step' })
    expect(buttons().map((b) => b.getAttribute('aria-busy'))).toEqual([null, null, 'true', null])
  })

  it('shows the alert line below the toolbar in danger-text', () => {
    draw({ alert: 'Two behaviors have the ID sample-product/count.' })
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('Two behaviors have the ID sample-product/count.')
    expect(alert?.classList.contains('text-danger-text')).toBe(true)
    expect(toolbar().contains(alert)).toBe(false)
  })

  it('shows no alert line without text', () => {
    draw()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('has one tab stop: the first enabled button', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['resume', 'step']) }) })
    expect(buttons().map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1])
  })

  it('moves the focus with the arrow keys over the enabled buttons', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['stop', 'step', 'back']) }) })
    buttons()[0]?.focus()
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons()[2])
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons()[3])
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons()[0])
    press('ArrowLeft')
    expect(document.activeElement).toBe(buttons()[3])
    press('ArrowLeft')
    expect(document.activeElement).toBe(buttons()[2])
  })

  it('moves the focus from a disabled button to the neighbor that is enabled', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['stop', 'back']) }) })
    buttons()[1]?.focus()
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons()[3])
    buttons()[2]?.focus()
    press('ArrowLeft')
    expect(document.activeElement).toBe(buttons()[0])
    buttons()[2]?.focus()
    press('ArrowRight')
    expect(document.activeElement).toBe(buttons()[3])
  })

  it('leaves a key with a modifier to the browser', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['stop', 'step', 'back']) }) })
    buttons()[2]?.focus()
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        const event = new KeyboardEvent('keydown', { key, [modifier]: true, bubbles: true, cancelable: true })
        act(() => {
          buttons()[2]?.dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(buttons()[2])
      }
    }
  })

  it('moves the focus to the first and the last enabled button with Home and End', () => {
    draw({ state: state({ enabled: new Set<RunControl>(['resume', 'step']) }) })
    buttons()[2]?.focus()
    press('Home')
    expect(document.activeElement).toBe(buttons()[1])
    press('End')
    expect(document.activeElement).toBe(buttons()[2])
  })

  it('keeps the focus on the same button when its label changes', () => {
    draw({ state: state({ status: 'Running' }) })
    buttons()[1]?.focus()
    const before = buttons()[1]
    draw({ state: state({ status: 'Paused' }) })
    expect(buttons()[1]).toBe(before)
    expect(buttons()[1]?.textContent).toBe('Resume')
    expect(document.activeElement).toBe(before)
  })

  it('keeps the focus on a button that becomes disabled', () => {
    draw()
    buttons()[2]?.focus()
    draw({ state: state({ enabled: new Set<RunControl>(['stop', 'pause']) }) })
    expect(document.activeElement).toBe(buttons()[2])
    expect(buttons()[2]?.getAttribute('aria-disabled')).toBe('true')
  })
})
