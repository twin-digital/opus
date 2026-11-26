import { createRef, useState, act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRender } from '../test/render.js'
import { Field } from './Field.js'
import { TextArea } from './TextArea.js'

/** Types into a text area as a person does, through the native value setter. */
const type = (area: HTMLTextAreaElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('TextArea', () => {
  const view = useRender()
  const area = () => view.container.querySelector('textarea')

  it('shows a value and reports a change, as React does', () => {
    const onChange = vi.fn()
    const Harness = () => {
      const [value, setValue] = useState('Flees')
      return (
        <TextArea
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setValue(event.target.value)
          }}
        />
      )
    }
    view.draw(<Harness />)
    expect(area()?.value).toBe('Flees')
    type(area() as HTMLTextAreaElement, 'Flees light')
    expect(onChange).toHaveBeenCalledWith('Flees light')
    expect(area()?.value).toBe('Flees light')
  })

  it('keeps the value of the caller until the caller changes it', () => {
    const onChange = vi.fn()
    view.draw(<TextArea value='Flees' onChange={onChange} />)
    type(area() as HTMLTextAreaElement, 'Flees light')
    expect(onChange).toHaveBeenCalledOnce()
    expect(area()?.value).toBe('Flees')
  })

  it('holds its own text from a default value', () => {
    view.draw(<TextArea defaultValue='Flees' />)
    type(area() as HTMLTextAreaElement, 'Hides')
    expect(area()?.value).toBe('Hides')
  })

  it('passes a native attribute and a ref to the element', () => {
    const ref = createRef<HTMLTextAreaElement>()
    view.draw(<TextArea ref={ref} name='behaviour' rows={2} aria-describedby='hint' />)
    expect(area()?.getAttribute('name')).toBe('behaviour')
    expect(area()?.rows).toBe(2)
    expect(area()?.getAttribute('aria-describedby')).toBe('hint')
    expect(ref.current).toBe(area())
  })

  it('sets aria-invalid with the invalid prop', () => {
    view.draw(<TextArea invalid />)
    expect(area()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('takes the id, the description, and the error state from a field with an error message', () => {
    view.draw(
      <Field label='Behaviour' error='Describe the behaviour.'>
        <TextArea />
      </Field>,
    )
    const message = view.container.querySelector('p')
    expect(area()?.id).toBe(view.container.querySelector('label')?.htmlFor)
    expect(area()?.getAttribute('aria-describedby')).toBe(message?.id)
    expect(area()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('does not accept className', () => {
    // @ts-expect-error The look of a component is fixed.
    view.draw(<TextArea className='mine' />)
    expect(area()?.className).not.toContain('mine')
  })
})
