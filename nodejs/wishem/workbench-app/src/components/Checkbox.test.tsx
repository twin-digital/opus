import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { useRender } from '../test/render.js'
import { Checkbox } from './Checkbox.js'

describe('Checkbox', () => {
  const view = useRender()
  const input = () => view.container.querySelector('input')
  const label = () => view.container.querySelector('label')

  it('is a native checkbox with its label after it', () => {
    view.draw(
      <Checkbox checked={false} onChange={vi.fn()}>
        Flees light
      </Checkbox>,
    )
    expect(input()?.type).toBe('checkbox')
    expect(label()?.textContent).toBe('Flees light')
    expect(input()?.labels?.[0]).toBe(label())
  })

  it('calls onChange with the other boolean when a person clicks the label', () => {
    const onChange = vi.fn()
    view.draw(
      <Checkbox checked={false} onChange={onChange}>
        Flees light
      </Checkbox>,
    )
    act(() => {
      label()?.click()
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
    view.draw(
      <Checkbox checked onChange={onChange}>
        Flees light
      </Checkbox>,
    )
    act(() => {
      label()?.click()
    })
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps the value of checked until the prop changes', () => {
    view.draw(
      <Checkbox checked={false} onChange={vi.fn()}>
        Flees light
      </Checkbox>,
    )
    act(() => {
      input()?.click()
    })
    expect(input()?.checked).toBe(false)
    view.draw(
      <Checkbox checked onChange={vi.fn()}>
        Flees light
      </Checkbox>,
    )
    expect(input()?.checked).toBe(true)
  })

  it('calls nothing when it is disabled', () => {
    const onChange = vi.fn()
    view.draw(
      <Checkbox checked={false} onChange={onChange} disabled>
        Flees light
      </Checkbox>,
    )
    act(() => {
      label()?.click()
      input()?.click()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(input()?.disabled).toBe(true)
  })

  it('passes a native attribute and a ref to the input', () => {
    const ref = createRef<HTMLInputElement>()
    view.draw(
      <Checkbox ref={ref} checked={false} onChange={vi.fn()} name='flees' aria-describedby='hint'>
        Flees light
      </Checkbox>,
    )
    expect(input()?.getAttribute('name')).toBe('flees')
    expect(input()?.getAttribute('aria-describedby')).toBe('hint')
    expect(ref.current).toBe(input())
  })

  it('does not accept className', () => {
    view.draw(
      // @ts-expect-error The look of a component is fixed.
      <Checkbox checked={false} onChange={vi.fn()} className='mine'>
        Flees light
      </Checkbox>,
    )
    expect(input()?.className).not.toContain('mine')
    expect(label()?.className).not.toContain('mine')
  })
})
