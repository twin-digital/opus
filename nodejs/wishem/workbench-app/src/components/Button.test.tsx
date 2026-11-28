import { act, createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRender } from '../test/render.js'
import { Button } from './Button.js'

describe('Button', () => {
  const view = useRender()
  const button = () => view.container.querySelector('button')

  it('is a neutral button by default', () => {
    view.draw(<Button>Cancel</Button>)
    expect(button()?.classList.contains('bg-surface')).toBe(true)
    expect(button()?.classList.contains('border-control-border')).toBe(true)
    expect(button()?.classList.contains('border-transparent')).toBe(false)
  })

  it.each([
    ['maker', 'bg-maker'],
    ['quiet', 'text-fg-muted'],
    ['danger', 'bg-danger'],
  ] as const)('draws the %s variant', (variant, expected) => {
    view.draw(<Button variant={variant}>Go</Button>)
    expect(button()?.classList.contains(expected)).toBe(true)
  })

  it('has the type button by default and keeps a type of the caller', () => {
    view.draw(<Button>Go</Button>)
    expect(button()?.type).toBe('button')
    view.draw(<Button type='submit'>Go</Button>)
    expect(button()?.type).toBe('submit')
  })

  it('passes a native attribute and a ref to the element', () => {
    const ref = createRef<HTMLButtonElement>()
    view.draw(
      <Button ref={ref} name='apply' aria-label='Apply now'>
        Go
      </Button>,
    )
    expect(button()?.getAttribute('name')).toBe('apply')
    expect(button()?.getAttribute('aria-label')).toBe('Apply now')
    expect(ref.current).toBe(button())
  })

  it('calls onClick', () => {
    const onClick = vi.fn()
    view.draw(<Button onClick={onClick}>Go</Button>)
    button()?.click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('uses surface, fg, the control border, the small radius, and control text by default', () => {
    view.draw(<Button>Run</Button>)
    for (const name of ['bg-surface', 'text-fg', 'border-control-border', 'rounded-sm', 'text-control']) {
      expect(button()?.classList.contains(name), name).toBe(true)
    }
  })

  it('draws maker with the maker fill and on-fill text', () => {
    view.draw(<Button variant='maker'>Run</Button>)
    expect(button()?.classList.contains('bg-maker')).toBe(true)
    expect(button()?.classList.contains('text-on-fill')).toBe(true)
    expect(button()?.classList.contains('border-control-border')).toBe(false)
  })

  it('has a focus ring in maker-text', () => {
    view.draw(<Button>Run</Button>)
    expect(button()?.classList.contains('st-focus-visible:outline-maker-text')).toBe(true)
  })

  it('has the native disabled attribute, is dimmed, and leaves the tab order when it is disabled', () => {
    view.draw(<Button disabled>Step</Button>)
    const element = button() as HTMLButtonElement
    expect(element.disabled).toBe(true)
    expect(element.matches(':disabled')).toBe(true)
    expect(element.hasAttribute('aria-disabled')).toBe(false)
    expect(element.classList.contains('opacity-45')).toBe(true)
    element.focus()
    expect(document.activeElement).not.toBe(element)
  })

  it('has aria-disabled, no native disabled, and a tab stop when it is focusableWhenDisabled and disabled', () => {
    view.draw(
      <Button disabled focusableWhenDisabled>
        Step
      </Button>,
    )
    const element = button() as HTMLButtonElement
    expect(element.getAttribute('aria-disabled')).toBe('true')
    expect(element.disabled).toBe(false)
    expect(element.tabIndex).toBe(0)
    expect(element.classList.contains('opacity-45')).toBe(true)
    element.focus()
    expect(document.activeElement).toBe(element)
  })

  it('has no disabled state when it is focusableWhenDisabled and not disabled', () => {
    view.draw(<Button focusableWhenDisabled>Step</Button>)
    expect(button()?.hasAttribute('aria-disabled')).toBe(false)
    expect(button()?.disabled).toBe(false)
  })

  it.each([false, true])('calls no handler when it is disabled (focusableWhenDisabled: %s)', (focusable) => {
    const onClick = vi.fn()
    const onKeyDown = vi.fn()
    const onPointerDown = vi.fn()
    view.draw(
      <Button
        disabled
        focusableWhenDisabled={focusable}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      >
        Step
      </Button>,
    )
    const element = button() as HTMLButtonElement
    act(() => {
      element.click()
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    })
    expect(onClick).not.toHaveBeenCalled()
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('keeps the focus when it is focusableWhenDisabled and gets a click, Enter, or Space', () => {
    view.draw(
      <Button disabled focusableWhenDisabled>
        Step
      </Button>,
    )
    const element = button() as HTMLButtonElement
    element.focus()
    act(() => {
      element.click()
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(element)
  })

  it('does not submit a form when it is disabled', () => {
    const onSubmit = vi.fn((event: React.SyntheticEvent) => {
      event.preventDefault()
    })
    view.draw(
      <form onSubmit={onSubmit}>
        <Button type='submit' disabled focusableWhenDisabled>
          Wait
        </Button>
        <Button type='submit' disabled>
          Stop
        </Button>
      </form>,
    )
    for (const element of Array.from(view.container.querySelectorAll('button'))) {
      element.click()
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('has no hover style when it is disabled', () => {
    view.draw(<Button disabled>Step</Button>)
    expect(button()?.className).not.toContain('st-hover:')
    view.draw(<Button>Step</Button>)
    expect(button()?.className).toContain('st-hover:')
  })

  it('keeps the label when it loads', () => {
    view.draw(<Button loading>Run</Button>)
    expect(button()?.getAttribute('aria-busy')).toBe('true')
    expect(button()?.textContent).toBe('Run')
  })

  it('gives accessibleName priority over a native aria-label', () => {
    view.draw(
      <Button accessibleName='Clear count' aria-label='Other'>
        Clear
      </Button>,
    )
    expect(button()?.getAttribute('aria-label')).toBe('Clear count')
  })

  it('has no aria-label by default', () => {
    view.draw(<Button>Run</Button>)
    expect(button()?.hasAttribute('aria-label')).toBe(false)
  })

  it('shows the label and has the accessible name when it has accessibleName', () => {
    view.draw(<Button accessibleName='Clear count'>Clear</Button>)
    expect(button()?.textContent).toBe('Clear')
    expect(button()?.getAttribute('aria-label')).toBe('Clear count')
  })

  it('is busy, has no native disabled, and shows the spinner when it loads', () => {
    view.draw(<Button loading>Go</Button>)
    expect(button()?.getAttribute('aria-busy')).toBe('true')
    expect(button()?.hasAttribute('aria-disabled')).toBe(false)
    expect(button()?.hasAttribute('data-loading')).toBe(true)
    expect(button()?.disabled).toBe(false)
    expect(button()?.querySelector('[data-spinner]')).not.toBeNull()
  })

  it('shows no spinner and no busy state when it does not load', () => {
    view.draw(<Button>Go</Button>)
    expect(button()?.hasAttribute('aria-busy')).toBe(false)
    expect(button()?.hasAttribute('aria-disabled')).toBe(false)
    expect(button()?.querySelector('[data-spinner]')).toBeNull()
  })

  it('does not call onClick when it loads', () => {
    const onClick = vi.fn()
    view.draw(
      <Button onClick={onClick} loading>
        Go
      </Button>,
    )
    button()?.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit a form when it loads', () => {
    const onSubmit = vi.fn((event: React.SyntheticEvent) => {
      event.preventDefault()
    })
    view.draw(
      <form onSubmit={onSubmit}>
        <Button type='submit'>Go</Button>
        <Button type='submit' loading>
          Wait
        </Button>
      </form>,
    )
    const [go, wait] = Array.from(view.container.querySelectorAll('button'))
    wait.click()
    expect(onSubmit).not.toHaveBeenCalled()
    go.click()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('keeps the aria-busy and the aria-disabled of the caller when it does not load', () => {
    view.draw(
      <Button aria-busy aria-disabled>
        Go
      </Button>,
    )
    expect(button()?.getAttribute('aria-busy')).toBe('true')
    expect(button()?.getAttribute('aria-disabled')).toBe('true')
  })

  it('does not accept className and style', () => {
    // @ts-expect-error The look of a component is fixed.
    view.draw(<Button className='mine'>Go</Button>)
    expect(button()?.className).not.toContain('mine')
    // @ts-expect-error The look of a component is fixed.
    view.draw(<Button style={{ color: 'red' }}>Go</Button>)
    expect(button()?.className).not.toContain('mine')
  })
})
