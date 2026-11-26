import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { useRender } from '../test/render.js'
import { Field } from './Field.js'
import { TextInput } from './TextInput.js'

/** Types into an input as a person does, through the native value setter. */
const type = (input: HTMLInputElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('TextInput', () => {
  const view = useRender()
  const input = () => view.container.querySelector('input')

  it('shows a value and reports a change, as React does', () => {
    const onChange = vi.fn()
    const Harness = () => {
      const [value, setValue] = useState('Cave bat')
      return (
        <TextInput
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setValue(event.target.value)
          }}
        />
      )
    }
    view.draw(<Harness />)
    expect(input()?.value).toBe('Cave bat')
    type(input() as HTMLInputElement, 'Cave bats')
    expect(onChange).toHaveBeenCalledWith('Cave bats')
    expect(input()?.value).toBe('Cave bats')
  })

  it('keeps the value of the caller until the caller changes it', () => {
    const onChange = vi.fn()
    view.draw(<TextInput value='Cave bat' onChange={onChange} />)
    type(input() as HTMLInputElement, 'Cave bats')
    expect(onChange).toHaveBeenCalledOnce()
    expect(input()?.value).toBe('Cave bat')
  })

  it('holds its own text from a default value', () => {
    view.draw(<TextInput defaultValue='Cave bat' />)
    type(input() as HTMLInputElement, 'Owl')
    expect(input()?.value).toBe('Owl')
  })

  it('passes a native attribute and a ref to the element', () => {
    const ref = createRef<HTMLInputElement>()
    view.draw(<TextInput ref={ref} name='speed' placeholder='Name' aria-describedby='hint' readOnly />)
    expect(input()?.getAttribute('name')).toBe('speed')
    expect(input()?.getAttribute('placeholder')).toBe('Name')
    expect(input()?.getAttribute('aria-describedby')).toBe('hint')
    expect(input()?.readOnly).toBe(true)
    expect(ref.current).toBe(input())
  })

  it('sets aria-invalid with the invalid prop', () => {
    view.draw(<TextInput invalid />)
    expect(input()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('sets no aria-invalid by default and keeps the aria-invalid of the caller', () => {
    view.draw(<TextInput />)
    expect(input()?.hasAttribute('aria-invalid')).toBe(false)
    view.draw(<TextInput aria-invalid='grammar' />)
    expect(input()?.getAttribute('aria-invalid')).toBe('grammar')
  })

  it('takes the id, the description, and the error state from a field with an error message', () => {
    view.draw(
      <Field label='Speed' error='Enter a number.'>
        <TextInput />
      </Field>,
    )
    const message = view.container.querySelector('p')
    expect(input()?.id).toBe(view.container.querySelector('label')?.htmlFor)
    expect(input()?.getAttribute('aria-describedby')).toBe(message?.id)
    expect(input()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('does not accept className', () => {
    // @ts-expect-error The look of a component is fixed.
    view.draw(<TextInput className='mine' />)
    expect(input()?.className).not.toContain('mine')
  })
})
