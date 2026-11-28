import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, type ButtonProps } from './Button.js'

describe('Button', () => {
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

  const draw = (props: Partial<ButtonProps> = {}) => {
    act(() => {
      root.render(<Button label='Run' {...props} />)
    })
    return container.querySelector('button') as HTMLButtonElement
  }

  it('is a button with the label', () => {
    const button = draw()
    expect(button.type).toBe('button')
    expect(button.textContent).toBe('Run')
  })

  it('plain uses surface, fg, and the control border', () => {
    const { classList } = draw()
    for (const name of ['bg-surface', 'text-fg', 'border-control-border', 'rounded-sm', 'text-ui']) {
      expect(classList.contains(name), name).toBe(true)
    }
    expect(classList.contains('text-maker-text')).toBe(false)
  })

  it('maker uses the maker border and the maker text', () => {
    const { classList } = draw({ variant: 'maker' })
    expect(classList.contains('border-maker')).toBe(true)
    expect(classList.contains('text-maker-text')).toBe(true)
    expect(classList.contains('border-control-border')).toBe(false)
  })

  it('has a focus ring in accent', () => {
    expect(draw().classList.contains('focus-visible:outline-accent')).toBe(true)
  })

  it('calls onPress on a click', () => {
    const onPress = vi.fn()
    const button = draw({ onPress })
    act(() => {
      button.click()
    })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('disabled has aria-disabled, fg-muted, and stays focusable', () => {
    const button = draw({ disabled: true })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.disabled).toBe(false)
    expect(button.classList.contains('text-fg-muted')).toBe(true)
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('disabled has no hover style', () => {
    expect(draw({ disabled: true }).className).not.toContain('hover:')
    expect(draw({ disabled: false }).className).toContain('hover:bg-ground')
  })

  it('disabled calls nothing on a click, Enter, or Space and keeps the focus', () => {
    const onPress = vi.fn()
    const button = draw({ disabled: true, onPress })
    button.focus()
    act(() => {
      button.click()
      // A button turns Enter and Space into a click.
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      button.click()
    })
    expect(onPress).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button)
  })

  it('busy has aria-busy and keeps the label', () => {
    const button = draw({ busy: true })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.textContent).toBe('Run')
  })

  it('has no aria-busy and no aria-disabled by default', () => {
    const button = draw()
    expect(button.hasAttribute('aria-busy')).toBe(false)
    expect(button.hasAttribute('aria-disabled')).toBe(false)
  })

  it('has no aria-label by default', () => {
    expect(draw().hasAttribute('aria-label')).toBe(false)
  })

  it('shows the label and has the accessible name when it has accessibleName', () => {
    const button = draw({ label: 'Clear', accessibleName: 'Clear count' })
    expect(button.textContent).toBe('Clear')
    expect(button.getAttribute('aria-label')).toBe('Clear count')
  })
})
