import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRender } from '../test/render.js'
import { PromptBox, type PromptBoxProps } from './PromptBox.js'

/** Types into a text area as a person does, through the native value setter. */
const type = (area: HTMLTextAreaElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const press = (area: HTMLElement, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    area.dispatchEvent(event)
  })
  return event
}

describe('PromptBox', () => {
  const view = useRender()
  const area = () => view.container.querySelector('textarea') as HTMLTextAreaElement
  const box = () => view.container.querySelector('[role="group"]') as HTMLElement
  const button = (name: string) =>
    Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent.includes(name))

  const draw = (props: Partial<PromptBoxProps> = {}) => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    const node = (extra: Partial<PromptBoxProps> = {}) => (
      <PromptBox label='Prompt' onSend={onSend} onStop={onStop} {...props} {...extra} />
    )
    view.draw(node())
    return {
      onSend,
      onStop,
      redraw: (extra: Partial<PromptBoxProps>) => {
        view.draw(node(extra))
      },
    }
  }

  describe('sending', () => {
    it('reports send with the text on Enter and adds no new line', () => {
      const { onSend } = draw()
      type(area(), 'make the bats flee')
      const event = press(area(), { key: 'Enter' })
      expect(onSend).toHaveBeenCalledExactlyOnceWith('make the bats flee')
      expect(event.defaultPrevented).toBe(true)
      expect(area().value).toBe('make the bats flee')
    })

    it('reports the text as typed, with its spaces', () => {
      const { onSend } = draw()
      type(area(), '  make the bats flee \n')
      press(area(), { key: 'Enter' })
      expect(onSend).toHaveBeenCalledExactlyOnceWith('  make the bats flee \n')
    })

    it('does not send on Shift+Enter', () => {
      const { onSend } = draw()
      type(area(), 'make the bats flee')
      const event = press(area(), { key: 'Enter', shiftKey: true })
      expect(onSend).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('reports nothing on Enter with no text or only spaces', () => {
      const { onSend } = draw()
      press(area(), { key: 'Enter' })
      type(area(), '   ')
      press(area(), { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    })

    it('reports nothing on Enter during composition', () => {
      const { onSend } = draw()
      type(area(), 'make the bats flee')
      const event = press(area(), { key: 'Enter', isComposing: true })
      press(area(), { key: 'Enter', keyCode: 229 })
      expect(onSend).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('sends on a click of Make a wish', () => {
      const { onSend } = draw()
      type(area(), 'make the bats flee')
      act(() => {
        button('Make a wish')?.click()
      })
      expect(onSend).toHaveBeenCalledExactlyOnceWith('make the bats flee')
    })

    it('disables Make a wish with no text or only spaces', () => {
      draw()
      expect(button('Make a wish')?.getAttribute('aria-disabled')).toBe('true')
      type(area(), '  ')
      expect(button('Make a wish')?.getAttribute('aria-disabled')).toBe('true')
      type(area(), 'a')
      expect(button('Make a wish')?.hasAttribute('aria-disabled')).toBe(false)
    })

    it('starts with defaultValue and ignores a later change of the prop', () => {
      const { redraw } = draw({ defaultValue: 'first' })
      expect(area().value).toBe('first')
      redraw({ defaultValue: 'second' })
      expect(area().value).toBe('first')
    })

    it('gives the box and the text area the label as their name', () => {
      draw({ label: 'Describe a wish' })
      expect(box().getAttribute('aria-label')).toBe('Describe a wish')
      expect(area().getAttribute('aria-label')).toBe('Describe a wish')
    })

    it('shows the hint and the placeholder', () => {
      draw({ placeholder: 'Describe a game' })
      expect(box().textContent).toContain('Enter to send · Shift+Enter for a new line')
      expect(area().placeholder).toBe('Describe a game')
    })
  })

  describe('the working state and the end of the work', () => {
    it('empties when this box sent and the work ended', () => {
      const { redraw } = draw()
      type(area(), 'make the bats flee')
      press(area(), { key: 'Enter' })
      redraw({ working: true })
      expect(area().value).toBe('make the bats flee')
      redraw({ working: false })
      expect(area().value).toBe('')
    })

    it('keeps an editable text when this box sent, then stopped, and the work ended', () => {
      const { redraw, onStop } = draw()
      type(area(), 'make the bats flee')
      press(area(), { key: 'Enter' })
      redraw({ working: true })
      act(() => {
        button('Stop')?.click()
      })
      expect(onStop).toHaveBeenCalledOnce()
      redraw({ working: false })
      expect(area().value).toBe('make the bats flee')
      expect(area().readOnly).toBe(false)
    })

    it('locks with the text of defaultValue and keeps it after the work', () => {
      const { redraw } = draw({ working: true, defaultValue: 'make the bats flee' })
      expect(area().value).toBe('make the bats flee')
      expect(area().readOnly).toBe(true)
      redraw({ working: false })
      expect(area().value).toBe('make the bats flee')
      expect(area().readOnly).toBe(false)
    })

    it('locks with a draft that was not sent and keeps it after the work', () => {
      const { redraw } = draw()
      type(area(), 'a draft')
      redraw({ working: true })
      expect(area().value).toBe('a draft')
      expect(area().readOnly).toBe(true)
      redraw({ working: false })
      expect(area().value).toBe('a draft')
    })

    it('reports nothing on Enter while the work runs', () => {
      const { onSend } = draw({ working: true, defaultValue: 'make the bats flee' })
      press(area(), { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    })

    it('reports stop from Stop in a box that sent and in a box that made no send', () => {
      const first = draw({ working: true, defaultValue: 'a draft' })
      act(() => {
        button('Stop')?.click()
      })
      expect(first.onStop).toHaveBeenCalledOnce()

      const second = draw()
      type(area(), 'make the bats flee')
      press(area(), { key: 'Enter' })
      second.redraw({ working: true })
      act(() => {
        button('Stop')?.click()
      })
      expect(second.onStop).toHaveBeenCalledOnce()
    })

    it('makes the text read-only and out of the focus order while the work runs', () => {
      const { redraw } = draw({ working: true, defaultValue: 'text' })
      expect(area().readOnly).toBe(true)
      expect(area().tabIndex).toBe(-1)
      expect(button('Wishem is working')).toBeUndefined()
      expect(box().textContent).toContain('Wishem is working')
      expect(button('Stop')).toBeDefined()
      expect(button('Make a wish')).toBeUndefined()
      redraw({ working: false })
      expect(area().tabIndex).toBe(0)
    })

    it('does not clear a text that the designer changed after a send that started no work', () => {
      const { redraw } = draw()
      type(area(), 'first wish')
      press(area(), { key: 'Enter' })
      type(area(), 'a different draft')
      redraw({ working: true })
      redraw({ working: false })
      expect(area().value).toBe('a different draft')
    })
  })

  describe('focus', () => {
    it('moves focus from the text to Stop when the work starts', () => {
      const { redraw } = draw({ defaultValue: 'text' })
      act(() => {
        area().focus()
      })
      redraw({ working: true })
      expect(document.activeElement).toBe(button('Stop'))
    })

    it('returns focus to the text when the work ends and Stop had focus', () => {
      const { redraw } = draw({ defaultValue: 'text' })
      act(() => {
        area().focus()
      })
      redraw({ working: true })
      redraw({ working: false })
      expect(document.activeElement).toBe(area())
    })

    it('returns focus to the emptied text when the keyboard sent and the work ended', () => {
      const { redraw, onSend } = draw()
      act(() => {
        area().focus()
      })
      type(area(), 'make the bats flee')
      press(area(), { key: 'Enter' })
      expect(onSend).toHaveBeenCalledOnce()
      redraw({ working: true })
      expect(document.activeElement).toBe(button('Stop'))
      redraw({ working: false })
      expect(area().value).toBe('')
      expect(button('Make a wish')?.getAttribute('aria-disabled')).toBe('true')
      expect(document.activeElement).toBe(area())
    })

    it('does not move focus when a different element had it', () => {
      const outside = document.createElement('button')
      document.body.append(outside)
      const { redraw } = draw({ defaultValue: 'text' })
      act(() => {
        outside.focus()
      })
      redraw({ working: true })
      expect(document.activeElement).toBe(outside)
      redraw({ working: false })
      expect(document.activeElement).toBe(outside)
      outside.remove()
    })
  })

  describe('the disabled state', () => {
    it('disables the text area and the button and shows the reason', () => {
      draw({ disabled: true, disabledReason: 'Not connected', defaultValue: 'text' })
      expect(area().disabled).toBe(true)
      expect(button('Make a wish')?.getAttribute('aria-disabled')).toBe('true')
      expect(box().textContent).toContain('Not connected')
      expect(box().textContent).not.toContain('Enter to send')
    })

    it('shows the disabled state with no Stop when working and disabled', () => {
      draw({ disabled: true, working: true, defaultValue: 'text' })
      expect(area().disabled).toBe(true)
      expect(button('Stop')).toBeUndefined()
      expect(button('Make a wish')?.getAttribute('aria-disabled')).toBe('true')
      expect(box().textContent).not.toContain('Wishem is working')
    })

    it('shows the hint, and not the reason, when the box is not disabled', () => {
      draw({ disabledReason: 'Not connected' })
      expect(box().textContent).toContain('Enter to send')
      expect(box().textContent).not.toContain('Not connected')
    })

    it('reports nothing on Enter', () => {
      const { onSend } = draw({ disabled: true, defaultValue: 'text' })
      press(area(), { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    })
  })

  describe('the size of the text area', () => {
    it('sets the number of lines as custom properties and defaults to 3 and 8', () => {
      draw()
      expect(box().style.getPropertyValue('--min-lines')).toBe('3')
      expect(box().style.getPropertyValue('--max-lines')).toBe('8')
      draw({ minLines: 2, maxLines: 4 })
      expect(box().style.getPropertyValue('--min-lines')).toBe('2')
      expect(box().style.getPropertyValue('--max-lines')).toBe('4')
    })
  })
})
