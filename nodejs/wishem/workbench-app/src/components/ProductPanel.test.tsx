import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model } from '@thrashplay/wishem-core'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { ProductPanel, type ProductPanelProps } from './ProductPanel.js'

const SWITCH_TYPE = 'ct_switch'
const TARGET_FIELD = 'fld_target'
const SWITCH_ENTITY = 'e_5f0c1d2e-bbbb-cccc'

const model: Model = {
  definitions: [
    { id: COLOR_TYPE, label: 'Color', fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }] },
    { id: COUNTER_TYPE, label: 'Counter', fields: [{ id: COUNT_FIELD, label: 'count', type: 'number' }] },
    { id: SWITCH_TYPE, label: 'Switch', fields: [{ id: TARGET_FIELD, label: 'target', type: 'reference' }] },
  ],
  entities: [
    {
      id: SAMPLE_ENTITY,
      components: { [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' }, [COUNTER_TYPE]: { [COUNT_FIELD]: 0 } },
    },
    { id: SWITCH_ENTITY, components: { [SWITCH_TYPE]: { [TARGET_FIELD]: SAMPLE_ENTITY } } },
  ],
}

describe('ProductPanel', () => {
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

  const draw = (props: Partial<ProductPanelProps> = {}) => {
    act(() => {
      root.render(<ProductPanel model={model} onSelect={() => undefined} {...props} />)
    })
  }
  const items = () => Array.from(container.querySelectorAll('nav button'))

  it('shows one item for each entity, in order, with its name and short ID', () => {
    draw()
    expect(items().map((item) => item.textContent)).toEqual(['Color, Countere_99969ed3', 'Switche_5f0c1d2e'])
  })

  it('shows the zero state of the inspector with no selection', () => {
    draw()
    expect(container.textContent).toContain('Select an entity to change it.')
    expect(container.querySelector('fieldset')).toBeNull()
  })

  it('marks the selected item and shows its inspector', () => {
    draw({ selected: SAMPLE_ENTITY })
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual(['true', null])
    expect(container.querySelector('h2')?.textContent).toBe('Color, Counter')
    expect(container.textContent).toContain(SAMPLE_ENTITY)
    expect(Array.from(container.querySelectorAll('legend')).map((legend) => legend.textContent)).toEqual([
      'Color',
      'Counter',
    ])
  })

  it('shows the zero state when the selected ID is not an entity', () => {
    draw({ selected: 'e_missing' })
    expect(container.textContent).toContain('Select an entity to change it.')
  })

  it('gives a reference row one option for each entity, as name · short ID', () => {
    draw({ selected: SWITCH_ENTITY })
    const select = container.querySelector('select')
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual([
      'Color, Counter · e_99969ed3',
      'Switch · e_5f0c1d2e',
    ])
    expect(select?.value).toBe(SAMPLE_ENTITY)
  })

  it('calls onSelect with the ID of the clicked item', () => {
    const onSelect = vi.fn()
    draw({ onSelect })
    act(() => {
      ;(items()[1] as HTMLButtonElement).click()
    })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(SWITCH_ENTITY)
  })

  it('calls onChange with a SetFieldPayload', async () => {
    const onChange = vi.fn(() => Promise.resolve({ saved: true as const }))
    draw({ selected: SAMPLE_ENTITY, onChange })
    const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]')).find(
      (element) => element.labels?.[0]?.textContent === 'count',
    )
    act(() => {
      if (input) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '3')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      operation: 'set-field',
      payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value: 3 },
    })
  })

  describe('a reference-list field', () => {
    const LIST_TYPE = 'ct_deck'
    const CARDS_FIELD = 'fld_cards'
    const DECK = 'e_deck'
    const CARD = 'e_card'
    const deckModel: Model = {
      definitions: [
        { id: LIST_TYPE, label: 'Deck', fields: [{ id: CARDS_FIELD, label: 'Cards', type: 'reference-list' }] },
        { id: COLOR_TYPE, label: 'Color', fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }] },
      ],
      entities: [
        { id: DECK, components: { [LIST_TYPE]: { [CARDS_FIELD]: [CARD] } } },
        { id: CARD, components: { [COLOR_TYPE]: { [COLOR_FIELD]: 'red' } } },
      ],
    }
    const drawDeck = (onChange: ProductPanelProps['onChange']) => {
      act(() => {
        root.render(<ProductPanel model={deckModel} selected={DECK} onSelect={() => undefined} onChange={onChange} />)
      })
    }
    const press = async (selector: string) => {
      act(() => {
        container.querySelector<HTMLButtonElement>(selector)?.click()
      })
      await act(async () => {
        await Promise.resolve()
      })
    }

    it('calls onChange with add-reference and the four keys', async () => {
      const onChange = vi.fn(() => Promise.resolve({ saved: true as const }))
      drawDeck(onChange)
      await press('[role="group"] button:not([aria-label])')
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        operation: 'add-reference',
        payload: { entity: DECK, componentType: LIST_TYPE, field: CARDS_FIELD, reference: DECK },
      })
    })

    it('calls onChange with remove-reference and the four keys', async () => {
      const onChange = vi.fn(() => Promise.resolve({ saved: true as const }))
      drawDeck(onChange)
      await press('button[aria-label^="Remove Color"]')
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        operation: 'remove-reference',
        payload: { entity: DECK, componentType: LIST_TYPE, field: CARDS_FIELD, reference: CARD },
      })
    })
  })

  it('calls onClear with a ClearFieldPayload', async () => {
    const onClear = vi.fn(() => Promise.resolve({ saved: true as const }))
    draw({ selected: SAMPLE_ENTITY, onClear })
    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Clear count"]')?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onClear).toHaveBeenCalledExactlyOnceWith({
      entity: SAMPLE_ENTITY,
      componentType: COUNTER_TYPE,
      field: COUNT_FIELD,
    })
  })

  it('disables the controls with no onChange', () => {
    draw({ selected: SAMPLE_ENTITY })
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.disabled).toBe(true)
  })
})
