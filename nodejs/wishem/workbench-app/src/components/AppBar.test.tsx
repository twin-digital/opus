import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { AppBar, type AppBarProps, type RenameOutcome } from './AppBar.js'

const render = (title: string) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<AppBar title={title} />)
  return container
}

describe('AppBar', () => {
  it('is a header element with the night surface and on-night text', () => {
    const header = render('Wishem').firstElementChild
    expect(header?.tagName).toBe('HEADER')
    expect(header?.classList.contains('bg-night')).toBe(true)
    expect(header?.classList.contains('text-on-night')).toBe(true)
  })

  it('shows the title in a heading 1 in the display typeface, in lowercase by style', () => {
    const heading = render('Wishem').querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.classList.contains('font-display')).toBe(true)
    expect(heading?.classList.contains('lowercase')).toBe(true)
  })

  it('keeps the text of the heading as the title was given', () => {
    const heading = render('Wishem').querySelector('h1')
    heading?.querySelector('[aria-hidden="true"]')?.remove()
    expect(heading?.textContent).toBe('Wishem')
  })

  it('draws the full stop in maker, hidden from a screen reader', () => {
    const stop = render('Wishem').querySelector('h1 [aria-hidden="true"]')
    expect(stop?.textContent).toBe('.')
    expect(stop?.classList.contains('text-maker')).toBe(true)
  })

  it('cuts a long title with an ellipsis', () => {
    const heading = render('A very long title').querySelector('h1')
    expect(heading?.classList.contains('truncate')).toBe(true)
  })
})

interface Deferred {
  promise: Promise<RenameOutcome>
  resolve: (outcome: RenameOutcome) => void
}

const defer = (): Deferred => {
  let resolve: Deferred['resolve'] = () => undefined
  const promise = new Promise<RenameOutcome>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('AppBar that edits its title', () => {
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

  const draw = (props: AppBarProps) => {
    act(() => {
      root.render(<AppBar {...props} />)
    })
  }
  const button = () => container.querySelector<HTMLButtonElement>('h1 button')
  const field = () => container.querySelector<HTMLInputElement>('input')
  const alert = () => container.querySelector('[role="alert"]')
  const open = () => {
    act(() => {
      button()?.click()
    })
  }
  const type = (text: string) => {
    act(() => {
      const input = field()
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
  }
  const press = (key: string) => {
    act(() => {
      field()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })
  }
  const blur = () => {
    act(() => {
      field()?.blur()
    })
  }
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }
  const saved: RenameOutcome = { saved: true }
  const rejected = (reason: string): RenameOutcome => ({ saved: false, reason })

  it('shows the title as a button in the heading, with the name of the title', () => {
    draw({ title: 'Wishem', onRename: () => Promise.resolve(saved) })
    expect(button()?.textContent).toContain('Wishem')
    expect(button()?.getAttribute('title')).toBe('Change the title')
    const heading = container.querySelector('h1')
    heading?.querySelector('[aria-hidden="true"]')?.remove()
    expect(heading?.textContent).toBe('Wishem')
    expect(field()).toBeNull()
  })

  it('shows no button and the heading with no rename function', () => {
    draw({ title: 'Wishem' })
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('Wishem.')
  })

  it('opens a field with the title, not in lowercase, all selected and focused', () => {
    draw({ title: 'Wishem', onRename: () => Promise.resolve(saved) })
    open()
    const input = field()
    expect(input?.value).toBe('Wishem')
    expect(input?.classList.contains('lowercase')).toBe(false)
    expect(document.activeElement).toBe(input)
    expect([input?.selectionStart, input?.selectionEnd]).toEqual([0, 6])
  })

  it('calls the rename function one time with the text when Enter is pressed', async () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    await flush()
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Wishem studio')
  })

  it('calls the rename function one time when the focus leaves the field', async () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    blur()
    await flush()
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Wishem studio')
  })

  it('calls the rename function one time when Enter is followed by a move of the focus', () => {
    const onRename = vi.fn(() => defer().promise)
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    blur()
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('calls the rename function one time when Enter is pressed two times while it saves', () => {
    const onRename = vi.fn(() => defer().promise)
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    press('Enter')
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('closes the field with no call on Escape, and puts the focus on the title button', () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type('Other')
    press('Escape')
    expect(field()).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
    expect(button()?.textContent).toContain('Wishem')
    expect(document.activeElement).toBe(button())
  })

  it('closes the field with no call for an empty text', () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type('')
    press('Enter')
    expect(field()).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('closes the field with no call for the same title', () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    press('Enter')
    expect(field()).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('makes the field read-only and busy with the label SAVING while it waits', () => {
    const onRename = vi.fn(() => defer().promise)
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    expect(field()?.readOnly).toBe(true)
    expect(field()?.getAttribute('aria-busy')).toBe('true')
    const label = container.querySelector('header span.font-mono')
    expect(label?.textContent).toBe('Saving')
    expect(label?.classList.contains('uppercase')).toBe(true)
    expect(label?.classList.contains('text-on-night')).toBe(true)
  })

  it('does nothing on Escape while it saves', () => {
    const onRename = vi.fn(() => defer().promise)
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    press('Escape')
    expect(field()?.value).toBe('Wishem studio')
    expect(field()?.readOnly).toBe(true)
  })

  it('shows the line of the rejection with the text of the designer kept', async () => {
    const pending = defer()
    draw({ title: 'Wishem', onRename: () => pending.promise })
    open()
    type('Offline')
    press('Enter')
    pending.resolve(rejected('The workbench does not run. Start it, and try again.'))
    await flush()
    expect(alert()?.textContent).toBe('The title is not saved. The workbench does not run. Start it, and try again.')
    expect(alert()?.classList.contains('text-danger-text')).toBe(true)
    expect(alert()?.classList.contains('bg-ground')).toBe(true)
    expect(alert()?.closest('header')).toBeNull()
    expect(field()?.value).toBe('Offline')
    expect(field()?.readOnly).toBe(false)
    expect(field()?.hasAttribute('aria-busy')).toBe(false)
  })

  it('removes the line and calls again on a new commit after a rejection', async () => {
    const onRename = vi
      .fn<(title: string) => Promise<RenameOutcome>>()
      .mockResolvedValueOnce(rejected('No.'))
      .mockImplementationOnce(() => defer().promise)
    draw({ title: 'Wishem', onRename })
    open()
    type('Offline')
    press('Enter')
    await flush()
    expect(alert()).not.toBeNull()
    press('Enter')
    expect(alert()).toBeNull()
    expect(onRename).toHaveBeenCalledTimes(2)
  })

  it('keeps the field and the line, and does not call, when the focus leaves after a rejection', async () => {
    const onRename = vi.fn(() => Promise.resolve(rejected('No.')))
    draw({ title: 'Wishem', onRename })
    open()
    type('Offline')
    press('Enter')
    await flush()
    blur()
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(field()?.value).toBe('Offline')
    expect(alert()).not.toBeNull()
  })

  it('shows the line of a general failure when the rename function rejects', async () => {
    const onRename = vi.fn(() => Promise.reject<RenameOutcome>(new Error('x')))
    draw({ title: 'Wishem', onRename })
    open()
    type('Offline')
    press('Enter')
    await flush()
    expect(alert()?.textContent).toBe('The title is not saved. The workbench failed to apply the change.')
    expect(field()?.value).toBe('Offline')
    expect(field()?.readOnly).toBe(false)
  })

  it('shows the line of a general failure when the rename function throws', async () => {
    const onRename = vi.fn((): Promise<RenameOutcome> => {
      throw new Error('x')
    })
    draw({ title: 'Wishem', onRename })
    open()
    type('Offline')
    press('Enter')
    await flush()
    expect(alert()?.textContent).toBe('The title is not saved. The workbench failed to apply the change.')
    expect(field()?.value).toBe('Offline')
    expect(field()?.readOnly).toBe(false)
  })

  it('sends the text with no spaces at the ends', async () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type('  Wishem studio  ')
    press('Enter')
    await flush()
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Wishem studio')
  })

  it('closes the field with no call when the trimmed text is the same title', () => {
    const onRename = vi.fn(() => Promise.resolve(saved))
    draw({ title: 'Wishem', onRename })
    open()
    type(' Wishem ')
    press('Enter')
    expect(onRename).not.toHaveBeenCalled()
    expect(field()).toBeNull()
  })

  it('closes the field after an accepted rename, and puts the focus on the title button', async () => {
    const pending = defer()
    draw({ title: 'Wishem', onRename: () => pending.promise })
    open()
    type('Wishem studio')
    press('Enter')
    pending.resolve(saved)
    await flush()
    expect(field()).toBeNull()
    expect(alert()).toBeNull()
    expect(document.activeElement).toBe(button())
  })

  it('shows the new title when it arrives after a saved rename', async () => {
    const pending = defer()
    const onRename = () => pending.promise
    draw({ title: 'Wishem', onRename })
    open()
    type('Wishem studio')
    press('Enter')
    pending.resolve(saved)
    await flush()
    expect(button()?.textContent).toContain('Wishem')
    expect(button()?.textContent).not.toContain('studio')
    draw({ title: 'Wishem studio', onRename })
    expect(button()?.textContent).toContain('Wishem studio')
  })

  it('has no error when the outcome arrives after the app bar is removed', async () => {
    const pending = defer()
    draw({ title: 'Wishem', onRename: () => pending.promise })
    open()
    type('Wishem studio')
    press('Enter')
    act(() => {
      root.render(<></>)
    })
    pending.resolve(rejected('No.'))
    await flush()
    expect(container.textContent).toBe('')
  })

  it('starts in a given state', () => {
    draw({
      title: 'Wishem',
      onRename: () => Promise.resolve(saved),
      initial: { state: 'not-saved', draft: 'Offline', reason: 'The workbench does not run.' },
    })
    expect(field()?.value).toBe('Offline')
    expect(alert()?.textContent).toBe('The title is not saved. The workbench does not run.')
  })
})
