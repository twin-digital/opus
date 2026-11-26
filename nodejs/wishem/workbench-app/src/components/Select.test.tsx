import { act, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRender } from '../test/render.js'
import { Field } from './Field.js'
import { Select, type SelectOption } from './Select.js'
import { ThemeScope } from './ThemeScope.js'

const options: SelectOption[] = [
  { value: 'enemy', label: 'Enemy' },
  { value: 'prop', label: 'Prop' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'boss', label: 'Boss', disabled: true },
]

describe('Select', () => {
  const view = useRender()

  const { draw } = view

  const trigger = () => view.container.querySelector<HTMLButtonElement>('button[role="combobox"]')
  const menu = () => document.querySelector<HTMLElement>('[role="listbox"]')
  const optionNames = () => Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent)

  /** Presses a pointer on an element as a person does. */
  const press = (element: Element) => {
    act(() => {
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
      }
    })
  }

  it('shows the label of the value in the trigger', () => {
    draw(<Select options={options} value='prop' onChange={vi.fn()} />)
    expect(trigger()?.textContent).toBe('Prop')
  })

  it('shows the placeholder when the value is undefined', () => {
    draw(<Select options={options} value={undefined} onChange={vi.fn()} placeholder='Select a kind' />)
    expect(trigger()?.textContent).toBe('Select a kind')
    expect(trigger()?.hasAttribute('data-placeholder')).toBe(true)
  })

  it('reports a selection with onChange and keeps the old value until the prop changes', () => {
    const onChange = vi.fn()
    const Harness = ({ value }: { value: string }) => <Select options={options} value={value} onChange={onChange} />
    draw(<Harness value='enemy' />)
    const button = trigger()
    expect(button).not.toBeNull()
    press(button as HTMLButtonElement)
    const prop = Array.from(document.querySelectorAll('[role="option"]')).find((o) => o.textContent === 'Prop')
    expect(prop).toBeDefined()
    press(prop as Element)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('prop')
    expect(trigger()?.textContent).toBe('Enemy')
    draw(<Harness value='prop' />)
    expect(trigger()?.textContent).toBe('Prop')
  })

  it('shows a value that is not in the options as text, with no menu entry and no error state', () => {
    const onChange = vi.fn()
    draw(<Select options={options} value='goat' onChange={onChange} open />)
    expect(trigger()?.textContent).toBe('goat')
    expect(trigger()?.hasAttribute('aria-invalid')).toBe(false)
    expect(optionNames()).toEqual(['Enemy', 'Prop', 'Pickup', 'Boss'])
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens an empty menu when there are no options', () => {
    draw(<Select options={[]} value={undefined} onChange={vi.fn()} placeholder='Select a kind' open />)
    expect(menu()).not.toBeNull()
    expect(optionNames()).toEqual([])
    expect(trigger()?.disabled).toBe(false)
  })

  it('does not select a disabled option', () => {
    const onChange = vi.fn()
    draw(<Select options={options} value='enemy' onChange={onChange} open />)
    const boss = Array.from(document.querySelectorAll('[role="option"]')).find((o) => o.textContent === 'Boss')
    expect(boss?.getAttribute('aria-disabled')).toBe('true')
    press(boss as Element)
    expect(onChange).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })

  it('marks the selected option', () => {
    draw(<Select options={options} value='prop' onChange={vi.fn()} open />)
    const selected = Array.from(document.querySelectorAll('[role="option"][aria-selected="true"]'))
    expect(selected.map((o) => o.textContent)).toEqual(['Prop'])
  })

  it('sets the error state with the invalid prop', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} invalid />)
    expect(trigger()?.getAttribute('aria-invalid')).toBe('true')
  })

  it('sets the error state, the name, and the description from a field with an error message', () => {
    draw(
      <Field label='Kind' error='Select a kind.'>
        <Select options={options} value={undefined} onChange={vi.fn()} />
      </Field>,
    )
    const button = trigger()
    expect(button?.getAttribute('aria-invalid')).toBe('true')
    expect(button?.id).toBe(view.container.querySelector('label')?.htmlFor)
    expect(button?.getAttribute('aria-describedby')).toBe(view.container.querySelector('p')?.id)
  })

  it('keeps the placeholder after a selection until the prop changes', () => {
    const onChange = vi.fn()
    draw(<Select options={options} value={undefined} onChange={onChange} placeholder='Select a kind' />)
    press(trigger() as HTMLButtonElement)
    const prop = Array.from(document.querySelectorAll('[role="option"]')).find((o) => o.textContent === 'Prop')
    press(prop as Element)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('prop')
    expect(trigger()?.textContent).toBe('Select a kind')
  })

  it('keeps the description of the caller before the error message of a field', () => {
    draw(
      <Field label='Kind' error='Select a kind.'>
        <Select options={options} value={undefined} onChange={vi.fn()} aria-describedby='hint' />
      </Field>,
    )
    expect(trigger()?.getAttribute('aria-describedby')).toBe(`hint ${view.container.querySelector('p')?.id}`)
  })

  it('passes only the aria attributes of the caller to the trigger', () => {
    // A `data-` attribute is allowed by the type check, and the select does not pass it on.
    draw(<Select options={options} value='enemy' onChange={vi.fn()} data-extra='x' />)
    expect(trigger()?.hasAttribute('data-extra')).toBe(false)
  })

  it('uses the id of the caller', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} id='kind' />)
    expect(trigger()?.id).toBe('kind')
  })

  it('passes the aria attributes to the trigger', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} aria-label='Kind' />)
    expect(trigger()?.getAttribute('aria-label')).toBe('Kind')
  })

  it('keeps the aria attributes of the caller when the field gives none', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} aria-invalid='grammar' aria-describedby='hint' />)
    expect(trigger()?.getAttribute('aria-invalid')).toBe('grammar')
    expect(trigger()?.getAttribute('aria-describedby')).toBe('hint')
  })

  it('disables the trigger', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} disabled />)
    expect(trigger()?.disabled).toBe(true)
  })

  it('draws the menu in the nearest theme scope', () => {
    draw(
      <ThemeScope theme='light' testId='outer'>
        <ThemeScope theme='dark' testId='inner'>
          <Select options={options} value='enemy' onChange={vi.fn()} open />
        </ThemeScope>
      </ThemeScope>,
    )
    const inner = view.container.querySelector('[data-testid="inner"]')
    expect(menu()).not.toBeNull()
    expect(inner?.contains(menu())).toBe(true)
  })

  it('draws the menu in the body with no theme scope', () => {
    draw(<Select options={options} value='enemy' onChange={vi.fn()} open />)
    expect(menu()).not.toBeNull()
    expect(view.container.contains(menu())).toBe(false)
    expect(document.body.contains(menu())).toBe(true)
  })

  it('stays open with a controlled open prop and no handler, with no console error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    draw(<Select options={options} value='enemy' onChange={vi.fn()} open />)
    const focused = document.querySelector<HTMLElement>('[role="option"]')
    expect(focused).not.toBeNull()
    act(() => {
      focused?.focus()
      focused?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(menu()).not.toBeNull()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('tells onOpenChange when a person opens the menu', () => {
    const onOpenChange = vi.fn()
    const Harness = () => {
      const [open, setOpen] = useState(false)
      return (
        <Select
          options={options}
          value='enemy'
          onChange={vi.fn()}
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        />
      )
    }
    draw(<Harness />)
    press(trigger() as HTMLButtonElement)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(menu()).not.toBeNull()
  })

  it('does not accept a className', () => {
    // @ts-expect-error The look of a component is fixed.
    draw(<Select options={options} value='enemy' onChange={vi.fn()} className='mine' />)
    expect(trigger()?.className).not.toContain('mine')
  })
})
