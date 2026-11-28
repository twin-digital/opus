import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityList, type EntityListItem, type EntityListProps } from './EntityList.js'

const items: EntityListItem[] = [
  { id: 'e_99969ed3-aaaa', name: 'Color, Counter', shortId: 'e_99969ed3' },
  { id: 'e_5f0c1d2e-bbbb', name: 'Switch', shortId: 'e_5f0c1d2e' },
]

describe('EntityList', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const draw = (props: Partial<EntityListProps> = {}) => {
    act(() => {
      root.render(<EntityList items={items} onSelect={() => undefined} {...props} />)
    })
  }
  const buttons = () => Array.from(container.querySelectorAll('button'))

  it('is a nav named Entities', () => {
    draw()
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Entities')
  })

  it('shows the label Entities and the count as mono labels in fg-muted', () => {
    draw()
    const labels = Array.from(container.querySelectorAll('nav > div > span'))
    expect(labels.map((label) => label.textContent)).toEqual(['Entities', '2'])
    for (const label of labels) {
      expect(label.classList.contains('font-mono')).toBe(true)
      expect(label.classList.contains('text-fg-muted')).toBe(true)
    }
  })

  it('shows one button for each item, with the name and the short ID', () => {
    draw()
    expect(
      buttons().map((button) => Array.from(button.querySelectorAll('span')).map((span) => span.textContent)),
    ).toEqual([
      ['Color, Counter', 'e_99969ed3'],
      ['Switch', 'e_5f0c1d2e'],
    ])
    const [name, id] = Array.from(buttons()[0]?.querySelectorAll('span') ?? [])
    expect(name.classList.contains('text-fg')).toBe(true)
    expect(id.classList.contains('font-mono')).toBe(true)
    expect(id.classList.contains('text-fg-muted')).toBe(true)
  })

  it('marks only the selected item with aria-current and an accent name', () => {
    draw({ selected: 'e_5f0c1d2e-bbbb' })
    expect(buttons().map((button) => button.getAttribute('aria-current'))).toEqual([null, 'true'])
    expect(buttons()[1]?.querySelector('span')?.classList.contains('text-accent-text')).toBe(true)
    expect(buttons()[0]?.querySelector('span')?.classList.contains('text-accent-text')).toBe(false)
  })

  it('marks no item when nothing is selected', () => {
    draw()
    expect(buttons().every((button) => !button.hasAttribute('aria-current'))).toBe(true)
  })

  it('calls onSelect with the ID of a clicked item', () => {
    const onSelect = vi.fn()
    draw({ onSelect })
    act(() => {
      buttons()[1]?.click()
    })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('e_5f0c1d2e-bbbb')
  })

  it('selects with the click that Enter and Space make, and keeps the focus on the item', () => {
    const onSelect = vi.fn()
    draw({ onSelect })
    const button = buttons()[0]
    act(() => {
      button.focus()
    })
    // A button turns Enter and Space into a click.
    act(() => {
      button.click()
    })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('e_99969ed3-aaaa')
    expect(document.activeElement).toBe(button)
  })

  it('shows the zero state when there is no item', () => {
    draw({ items: [] })
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Entities')
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.textContent).toContain('No entities yet.')
  })
})
