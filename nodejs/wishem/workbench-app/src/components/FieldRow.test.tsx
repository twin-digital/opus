import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { FieldDefinition, FieldValue } from '@thrashplay/wishem-core'
import { FieldRow, type ChangeOutcome, type FieldRowProps } from './FieldRow.js'

interface Deferred {
  promise: Promise<ChangeOutcome>
  resolve: (outcome: ChangeOutcome) => void
}

const defer = (): Deferred => {
  let resolve: Deferred['resolve'] = () => undefined
  const promise = new Promise<ChangeOutcome>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const count: FieldDefinition = { id: 'f_count', label: 'count', type: 'number' }
const color: FieldDefinition = { id: 'f_color', label: 'color', type: 'string' }
const on: FieldDefinition = { id: 'f_on', label: 'on', type: 'boolean' }
const target: FieldDefinition = { id: 'f_target', label: 'target', type: 'reference' }
const options = [
  { id: 'e_a', text: 'Color, Counter · e_a' },
  { id: 'e_b', text: 'Switch · e_b' },
]

const saved: ChangeOutcome = { saved: true }
const rejected = (reason: string): ChangeOutcome => ({ saved: false, reason })
const accept = () => Promise.resolve(saved)

describe('FieldRow', () => {
  let container: HTMLDivElement
  let root: Root
  let errors: MockInstance<typeof console.error>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    const calls = errors.mock.calls.length
    errors.mockRestore()
    expect(calls).toBe(0)
  })

  const draw = (props: FieldRowProps) => {
    act(() => {
      root.render(<FieldRow {...props} />)
    })
  }
  const text = () => container.querySelector<HTMLInputElement>('input[type="text"]')
  const box = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')
  const select = () => container.querySelector<HTMLSelectElement>('select')
  const alert = () => container.querySelector('[role="alert"]')
  const type = (value: string) => {
    act(() => {
      const input = text()
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
  }
  const press = (key: string) => {
    act(() => {
      text()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })
  }
  const choose = (id: string) => {
    act(() => {
      const element = select()
      if (element) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, id)
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
  }
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  describe('controls', () => {
    it('shows the label, the mono type, and a text field named by the label for a number', () => {
      draw({ field: count, value: 0, onChange: accept })
      const mono = container.querySelector('.font-mono')
      expect(mono?.textContent).toBe('number')
      expect(mono?.classList.contains('text-fg-muted')).toBe(true)
      expect(text()?.labels?.[0]?.textContent).toBe('count')
      expect(text()?.value).toBe('0')
      expect(text()?.getAttribute('inputmode')).toBe('decimal')
    })

    it('shows a string value in a text field', () => {
      draw({ field: color, value: '#1d4ed8', onChange: accept })
      expect(text()?.value).toBe('#1d4ed8')
      expect(text()?.getAttribute('inputmode')).toBeNull()
    })

    it('shows a boolean as a check box named by the label', () => {
      draw({ field: on, value: true, onChange: accept })
      expect(box()?.checked).toBe(true)
      expect(box()?.labels?.[0]?.textContent).toBe('on')
    })

    it('shows a reference as a select with an option for each entity, named by the label', () => {
      draw({ field: target, value: 'e_b', options, onChange: accept })
      expect(select()?.labels[0]?.textContent).toBe('target')
      expect(select()?.value).toBe('e_b')
      expect(Array.from(select()?.options ?? []).map((option) => option.text)).toEqual(options.map((o) => o.text))
    })

    it('shows the mono label no value for a field with no value, and an empty field', () => {
      draw({ field: color, value: undefined, onChange: accept })
      expect(container.textContent).toContain('no value')
      expect(text()?.value).toBe('')
    })

    it('shows no label no value for a field with a value', () => {
      draw({ field: color, value: 'x', onChange: accept })
      expect(container.textContent).not.toContain('no value')
    })

    it('gives a reference with no value a first option No value that is disabled and selected', () => {
      draw({ field: target, value: undefined, options, onChange: accept })
      const first = select()?.options[0]
      expect(first?.text).toBe('No value')
      expect(first?.disabled).toBe(true)
      expect(select()?.selectedIndex).toBe(0)
    })

    it('gives a reference to no entity the option No value', () => {
      draw({ field: target, value: 'e_gone', options, onChange: accept })
      expect(select()?.options[0]?.text).toBe('No value')
      expect(select()?.selectedIndex).toBe(0)
    })

    it('disables each control with no change function and shows the value', () => {
      draw({ field: color, value: 'x' })
      expect(text()?.disabled).toBe(true)
      expect(text()?.value).toBe('x')
      draw({ field: on, value: true })
      expect(box()?.disabled).toBe(true)
      expect(box()?.checked).toBe(true)
      draw({ field: target, value: 'e_a', options })
      expect(select()?.disabled).toBe(true)
    })
  })

  describe('text commit', () => {
    it('commits the typed text once on Enter, with no trim, and keeps the focus', async () => {
      const onChange = vi.fn(accept)
      draw({ field: color, value: 'a', onChange })
      act(() => {
        text()?.focus()
      })
      type(' b ')
      press('Enter')
      await flush()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(' b ')
      expect(document.activeElement).toBe(text())
    })

    it('commits once when Enter is followed by the move of the focus', async () => {
      const onChange = vi.fn(accept)
      draw({ field: color, value: 'a', onChange })
      act(() => {
        text()?.focus()
      })
      type('b')
      press('Enter')
      await flush()
      act(() => {
        text()?.blur()
      })
      await flush()
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('commits when the focus leaves the field', async () => {
      const onChange = vi.fn(accept)
      draw({ field: color, value: 'a', onChange })
      act(() => {
        text()?.focus()
      })
      type('b')
      act(() => {
        text()?.blur()
      })
      await flush()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('b')
    })

    it('sends Number(text) for a number', async () => {
      const onChange = vi.fn(accept)
      draw({ field: count, value: 0, onChange })
      type(' 7.5 ')
      press('Enter')
      await flush()
      expect(onChange).toHaveBeenCalledWith(7.5)
    })

    it('restores the value on Escape, keeps the focus, and sends nothing', () => {
      const onChange = vi.fn(accept)
      draw({ field: color, value: 'a', onChange })
      act(() => {
        text()?.focus()
      })
      type('zzz')
      press('Escape')
      expect(text()?.value).toBe('a')
      expect(document.activeElement).toBe(text())
      act(() => {
        text()?.blur()
      })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('sends nothing for the same value', () => {
      const onChange = vi.fn(accept)
      draw({ field: count, value: 0, onChange })
      type('0')
      press('Enter')
      type('0.0')
      press('Enter')
      expect(onChange).not.toHaveBeenCalled()
      expect(alert()).toBeNull()
    })

    it('sends nothing for an empty text in a field with no value', () => {
      const onChange = vi.fn(accept)
      draw({ field: color, value: undefined, onChange })
      type('x')
      type('')
      press('Enter')
      expect(onChange).not.toHaveBeenCalled()
    })

    it.each(['', '   ', 'ten', 'Infinity', '-Infinity', 'NaN'])(
      'gives Type a number. for %j, with no call',
      (value) => {
        const onChange = vi.fn(accept)
        draw({ field: count, value: 3, onChange })
        type(value)
        press('Enter')
        expect(onChange).not.toHaveBeenCalled()
        expect(alert()?.textContent).toBe('The value is not saved. Type a number.')
        expect(text()?.value).toBe(value)
      },
    )

    it('shows the value that the prop gives while the designer has no draft', () => {
      draw({ field: color, value: 'a', onChange: accept })
      draw({ field: color, value: 'b', onChange: accept })
      expect(text()?.value).toBe('b')
    })

    it('keeps a draft when the prop value changes', () => {
      draw({ field: color, value: 'a', onChange: accept })
      type('mine')
      draw({ field: color, value: 'b', onChange: accept })
      expect(text()?.value).toBe('mine')
    })

    it('shows the value of the part after an accepted change', async () => {
      draw({ field: color, value: 'a', onChange: accept })
      type('b')
      press('Enter')
      await flush()
      draw({ field: color, value: 'c', onChange: accept })
      expect(text()?.value).toBe('c')
    })
  })

  describe('check box and select', () => {
    it('calls onChange at each change of a check box', async () => {
      const onChange = vi.fn(accept)
      draw({ field: on, value: false, onChange })
      act(() => {
        box()?.click()
      })
      await flush()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenLastCalledWith(true)
    })

    it('calls onChange with the ID of the option at each change of a select', async () => {
      const onChange = vi.fn(accept)
      draw({ field: target, value: 'e_a', options, onChange })
      choose('e_b')
      await flush()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('e_b')
    })
  })

  describe('the state of a change', () => {
    it('is saving: read-only, busy, and with the label Saving, until the outcome', async () => {
      const pending = defer()
      draw({ field: color, value: 'a', onChange: () => pending.promise })
      type('b')
      press('Enter')
      expect(text()?.readOnly).toBe(true)
      expect(text()?.getAttribute('aria-busy')).toBe('true')
      expect(container.textContent).toContain('Saving')
      pending.resolve(saved)
      await flush()
      expect(text()?.readOnly).toBe(false)
      expect(text()?.getAttribute('aria-busy')).toBeNull()
      expect(container.textContent).not.toContain('Saving')
    })

    it('does nothing for Enter and Escape while it saves', () => {
      const onChange = vi.fn(() => defer().promise)
      draw({ field: color, value: 'a', onChange })
      type('b')
      press('Enter')
      press('Enter')
      press('Escape')
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(text()?.value).toBe('b')
    })

    it('disables a check box and a select while they save', () => {
      draw({ field: on, value: false, onChange: () => defer().promise })
      act(() => {
        box()?.click()
      })
      expect(box()?.disabled).toBe(true)
      expect(box()?.getAttribute('aria-busy')).toBe('true')
      draw({ field: target, value: 'e_a', options, onChange: () => defer().promise })
      choose('e_b')
      expect(select()?.disabled).toBe(true)
      expect(select()?.getAttribute('aria-busy')).toBe('true')
    })

    it('is not saved after a rejection: an alert with the reason, and the value of the designer stays', async () => {
      draw({ field: color, value: 'a', onChange: () => Promise.resolve(rejected('The workbench does not run.')) })
      type('mine')
      press('Enter')
      await flush()
      expect(alert()?.textContent).toBe('The value is not saved. The workbench does not run.')
      expect(text()?.value).toBe('mine')
      expect(text()?.readOnly).toBe(false)
    })

    it('keeps the choice of a check box after a rejection', async () => {
      draw({ field: on, value: false, onChange: () => Promise.resolve(rejected('No.')) })
      act(() => {
        box()?.click()
      })
      await flush()
      expect(box()?.checked).toBe(true)
      expect(alert()?.textContent).toBe('The value is not saved. No.')
    })

    it('commits again after a rejection and clears the alert on success', async () => {
      const onChange = vi
        .fn<(value: FieldValue) => Promise<ChangeOutcome>>()
        .mockResolvedValueOnce(rejected('No.'))
        .mockResolvedValueOnce(saved)
      draw({ field: color, value: 'a', onChange })
      type('b')
      press('Enter')
      await flush()
      press('Enter')
      await flush()
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(alert()).toBeNull()
    })

    it('clears the alert on Escape', async () => {
      draw({ field: color, value: 'a', onChange: () => Promise.resolve(rejected('No.')) })
      type('b')
      press('Enter')
      await flush()
      press('Escape')
      expect(alert()).toBeNull()
      expect(text()?.value).toBe('a')
    })

    it('shows a general line when onChange rejects', async () => {
      draw({ field: color, value: 'a', onChange: () => Promise.reject(new Error('boom')) })
      type('b')
      press('Enter')
      await flush()
      expect(alert()?.textContent).toBe('The value is not saved. The workbench failed to apply the change.')
      expect(errors).toHaveBeenCalledTimes(1)
      errors.mockClear()
    })

    it('gives no error when the row is removed while it saves', async () => {
      const pending = defer()
      draw({ field: color, value: 'a', onChange: () => pending.promise })
      type('b')
      press('Enter')
      act(() => {
        root.render(<div />)
      })
      pending.resolve(rejected('late'))
      await flush()
      expect(container.textContent).toBe('')
    })
  })

  describe('the button Clear', () => {
    const clearButton = () =>
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear')
    const clickClear = () => {
      act(() => {
        clearButton()?.click()
      })
    }

    it.each([
      ['number', count, 0, 'Clear count'],
      ['string', color, '#1d4ed8', 'Clear color'],
      ['boolean', on, true, 'Clear on'],
      ['reference', target, 'e_a', 'Clear target'],
    ] as const)('shows the button for a %s with the name Clear <label>', (_type, field, value, name) => {
      draw({ field, value, options, onChange: accept, onClear: accept })
      expect(clearButton()?.getAttribute('aria-label')).toBe(name)
      expect(clearButton()?.getAttribute('aria-disabled')).toBeNull()
    })

    it('disables the button with no value, and keeps the focus on it', () => {
      draw({ field: color, value: undefined, onChange: accept, onClear: accept })
      expect(clearButton()?.getAttribute('aria-disabled')).toBe('true')
      act(() => {
        clearButton()?.focus()
      })
      expect(document.activeElement).toBe(clearButton())
    })

    it('disables the button with no onClear', () => {
      draw({ field: color, value: 'x', onChange: accept })
      expect(clearButton()?.getAttribute('aria-disabled')).toBe('true')
    })

    it('calls onClear once for a click', () => {
      const onClear = vi.fn(() => defer().promise)
      draw({ field: color, value: 'x', onChange: accept, onClear })
      clickClear()
      expect(onClear).toHaveBeenCalledTimes(1)
    })

    it('calls onClear once for Enter and for Space (a button turns each key into a click)', () => {
      for (const key of ['Enter', ' ']) {
        const onClear = vi.fn(() => defer().promise)
        draw({ field: color, value: 'x', onChange: accept, onClear })
        act(() => {
          const button = clearButton()
          button?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
          button?.click()
        })
        expect(onClear).toHaveBeenCalledTimes(1)
        act(() => {
          root.render(<div />)
        })
      }
    })

    it('shows Saving and aria-busy while it waits, and disables the button', async () => {
      const pending = defer()
      draw({ field: color, value: 'x', onChange: accept, onClear: () => pending.promise })
      clickClear()
      expect(container.textContent).toContain('Saving')
      expect(text()?.getAttribute('aria-busy')).toBe('true')
      expect(clearButton()?.getAttribute('aria-disabled')).toBe('true')
      pending.resolve(saved)
      await flush()
      expect(container.textContent).not.toContain('Saving')
    })

    it('disables a check box and a select while a clear waits', () => {
      draw({ field: on, value: true, onChange: accept, onClear: () => defer().promise })
      clickClear()
      expect(box()?.disabled).toBe(true)
      draw({ field: target, value: 'e_a', options, onChange: accept, onClear: () => defer().promise })
      clickClear()
      expect(select()?.disabled).toBe(true)
    })

    it('ends with no draft and no alert after an accepted clear, and keeps the focus on the button', async () => {
      draw({ field: color, value: 'x', onChange: accept, onClear: accept })
      act(() => {
        clearButton()?.focus()
      })
      clickClear()
      await flush()
      draw({ field: color, value: undefined, onChange: accept, onClear: accept })
      expect(alert()).toBeNull()
      expect(text()?.value).toBe('')
      expect(clearButton()?.getAttribute('aria-disabled')).toBe('true')
      expect(document.activeElement).toBe(clearButton())
    })

    it('shows The value is not cleared. and the reason with the role alert after a rejection', async () => {
      draw({
        field: color,
        value: 'x',
        onChange: accept,
        onClear: () => Promise.resolve(rejected('The workbench does not run.')),
      })
      clickClear()
      await flush()
      expect(alert()?.textContent).toBe('The value is not cleared. The workbench does not run.')
      expect(text()?.value).toBe('x')
      expect(clearButton()?.getAttribute('aria-disabled')).toBeNull()
    })

    it('removes the alert after an accepted change', async () => {
      draw({ field: color, value: 'x', onChange: accept, onClear: () => Promise.resolve(rejected('No.')) })
      clickClear()
      await flush()
      type('y')
      press('Enter')
      await flush()
      expect(alert()).toBeNull()
    })

    it('removes the alert after an accepted clear', async () => {
      const onClear = vi
        .fn<() => Promise<ChangeOutcome>>()
        .mockResolvedValueOnce(rejected('No.'))
        .mockResolvedValueOnce(saved)
      draw({ field: color, value: 'x', onChange: accept, onClear })
      clickClear()
      await flush()
      clickClear()
      await flush()
      expect(alert()).toBeNull()
    })

    it('names the save, not the clear, for a rejected change after a rejected clear', async () => {
      draw({
        field: color,
        value: 'x',
        onChange: () => Promise.resolve(rejected('Bad.')),
        onClear: () => Promise.resolve(rejected('No.')),
      })
      clickClear()
      await flush()
      type('y')
      press('Enter')
      await flush()
      expect(alert()?.textContent).toBe('The value is not saved. Bad.')
    })

    it('clears a refused draft and removes its alert', async () => {
      const onClear = vi.fn(accept)
      draw({ field: count, value: 3, onChange: accept, onClear })
      type('ten')
      press('Enter')
      expect(alert()?.textContent).toBe('The value is not saved. Type a number.')
      clickClear()
      await flush()
      expect(onClear).toHaveBeenCalledTimes(1)
      expect(alert()).toBeNull()
      draw({ field: count, value: undefined, onChange: accept, onClear })
      expect(text()?.value).toBe('')
    })

    it('shows a general line when onClear rejects', async () => {
      draw({ field: color, value: 'x', onChange: accept, onClear: () => Promise.reject(new Error('boom')) })
      clickClear()
      await flush()
      expect(alert()?.textContent).toBe('The value is not cleared. The workbench failed to apply the change.')
      expect(errors).toHaveBeenCalledTimes(1)
      errors.mockClear()
    })

    it('gives no error when the row is removed while a clear waits', async () => {
      const pending = defer()
      draw({ field: color, value: 'x', onChange: accept, onClear: () => pending.promise })
      clickClear()
      act(() => {
        root.render(<div />)
      })
      pending.resolve(rejected('late'))
      await flush()
      expect(container.textContent).toBe('')
    })

    it('keeps the button disabled while a text draft commits on the blur', async () => {
      const pending = defer()
      const onClear = vi.fn(accept)
      draw({ field: color, value: 'a', onChange: () => pending.promise, onClear })
      act(() => {
        text()?.focus()
      })
      type('b')
      act(() => {
        text()?.blur()
      })
      expect(clearButton()?.getAttribute('aria-disabled')).toBe('true')
      clickClear()
      expect(onClear).not.toHaveBeenCalled()
      pending.resolve(saved)
      await flush()
    })

    it('starts not cleared with the reason', () => {
      draw({
        field: count,
        value: 0,
        onChange: accept,
        onClear: accept,
        initial: { state: 'not-cleared', reason: 'The workbench does not run. Start it, and try again.' },
      })
      expect(alert()?.textContent).toBe(
        'The value is not cleared. The workbench does not run. Start it, and try again.',
      )
      expect(text()?.value).toBe('0')
    })
  })

  describe('the first state', () => {
    it('starts saving with the draft', () => {
      draw({ field: count, value: 0, onChange: () => defer().promise, initial: { state: 'saving', draft: '7' } })
      expect(text()?.value).toBe('7')
      expect(text()?.readOnly).toBe(true)
      expect(container.textContent).toContain('Saving')
    })

    it('starts not saved with the draft and the reason', () => {
      draw({
        field: count,
        value: 0,
        onChange: accept,
        initial: { state: 'not-saved', draft: 'ten', reason: 'Type a number.' },
      })
      expect(text()?.value).toBe('ten')
      expect(alert()?.textContent).toBe('The value is not saved. Type a number.')
    })

    it('starts saving with a boolean draft', () => {
      draw({ field: on, value: false, onChange: () => defer().promise, initial: { state: 'saving', draft: true } })
      expect(box()?.checked).toBe(true)
      expect(box()?.disabled).toBe(true)
    })
  })
})
