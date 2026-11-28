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

  it('does not call onClick when it is disabled', () => {
    const onClick = vi.fn()
    view.draw(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    button()?.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(button()?.getAttribute('aria-disabled')).toBe('true')
  })

  it('is dimmed, has aria-disabled, and stays focusable when it is disabled', () => {
    view.draw(<Button disabled>Step</Button>)
    const element = button() as HTMLButtonElement
    expect(element.getAttribute('aria-disabled')).toBe('true')
    expect(element.disabled).toBe(false)
    expect(element.classList.contains('opacity-45')).toBe(true)
    element.focus()
    expect(document.activeElement).toBe(element)
  })

  it('has no hover style when it is disabled', () => {
    view.draw(<Button disabled>Step</Button>)
    expect(button()?.className).not.toContain('st-hover:')
    view.draw(<Button>Step</Button>)
    expect(button()?.className).toContain('st-hover:')
  })

  it('calls nothing on a click, Enter, or Space when it is disabled, and keeps the focus', () => {
    const onClick = vi.fn()
    view.draw(
      <Button disabled onClick={onClick}>
        Step
      </Button>,
    )
    const element = button() as HTMLButtonElement
    element.focus()
    act(() => {
      element.click()
      // A button turns Enter and Space into a click.
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
      element.click()
    })
    expect(onClick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(element)
  })

  it('keeps the label when it loads', () => {
    view.draw(<Button loading>Run</Button>)
    expect(button()?.getAttribute('aria-busy')).toBe('true')
    expect(button()?.textContent).toBe('Run')
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

  it('is busy, not disabled, and shows the spinner when it loads', () => {
    view.draw(<Button loading>Go</Button>)
    expect(button()?.getAttribute('aria-busy')).toBe('true')
    expect(button()?.getAttribute('aria-disabled')).toBe('true')
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
