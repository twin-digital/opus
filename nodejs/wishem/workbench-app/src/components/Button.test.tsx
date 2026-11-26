import { createRef } from 'react'
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

  it('does not call onClick when it is disabled', () => {
    const onClick = vi.fn()
    view.draw(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    button()?.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(button()?.disabled).toBe(true)
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

  it('does not accept className and style', () => {
    // @ts-expect-error The look of a component is fixed.
    view.draw(<Button className='mine'>Go</Button>)
    // @ts-expect-error The look of a component is fixed.
    view.draw(<Button style={{ color: 'red' }}>Go</Button>)
    expect(button()?.className).not.toContain('mine')
  })
})
