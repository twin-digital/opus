import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { EntityInspector, type EntityInspectorProps } from './EntityInspector.js'

const color: ComponentTypeDefinition = {
  id: COLOR_TYPE,
  label: 'Color',
  fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }],
}
const counter: ComponentTypeDefinition = {
  id: COUNTER_TYPE,
  label: 'Counter',
  fields: [
    { id: COUNT_FIELD, label: 'count', type: 'number' },
    { id: 'fld_step', label: 'step', type: 'number' },
  ],
}

const entity: NonNullable<EntityInspectorProps['entity']> = {
  id: SAMPLE_ENTITY,
  name: 'Color, Counter',
  components: [
    { definition: color, values: { [COLOR_FIELD]: '#1d4ed8' } },
    { definition: counter, values: { [COUNT_FIELD]: 0 } },
  ],
}

describe('EntityInspector', () => {
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

  const draw = (props: Partial<EntityInspectorProps> = {}) => {
    act(() => {
      root.render(<EntityInspector entity={entity} options={[]} {...props} />)
    })
  }
  const text = (name: string) =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]')).find(
      (input) => input.labels?.[0]?.textContent === name,
    )
  const type = (input: HTMLInputElement, value: string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
  }

  it('shows the name as a heading 2, and the full ID as a mono label in fg-muted', () => {
    draw()
    expect(container.querySelector('h2')?.textContent).toBe('Color, Counter')
    const id = Array.from(container.querySelectorAll('.font-mono')).find(
      (element) => element.textContent === SAMPLE_ENTITY,
    )
    expect(id?.classList.contains('text-fg-muted')).toBe(true)
  })

  it('is a section named by the entity', () => {
    draw()
    const section = container.querySelector('section')
    expect(section?.getAttribute('aria-label') ?? section?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(section?.getAttribute('aria-label')).toBe('Color, Counter')
  })

  it('shows one fieldset for each component, in order, with its legend', () => {
    draw()
    const sets = Array.from(container.querySelectorAll('fieldset'))
    expect(sets.map((set) => set.querySelector('legend')?.textContent)).toEqual(['Color', 'Counter'])
  })

  it('shows one row for each field, also for a field with no value', () => {
    draw()
    const sets = Array.from(container.querySelectorAll('fieldset'))
    const labels = sets.map((set) => Array.from(set.querySelectorAll('label')).map((label) => label.textContent))
    expect(labels).toEqual([['color'], ['count', 'step']])
    expect(text('color')?.value).toBe('#1d4ed8')
    expect(text('count')?.value).toBe('0')
    expect(text('step')?.value).toBe('')
  })

  it('gives each row its options for a reference field', () => {
    const link: ComponentTypeDefinition = {
      id: 'ct_link',
      label: 'Link',
      fields: [{ id: 'fld_target', label: 'target', type: 'reference' }],
    }
    draw({
      entity: { id: 'e_1', name: 'Link', components: [{ definition: link, values: { fld_target: 'e_2' } }] },
      options: [
        { id: 'e_1', text: 'Link · e_1' },
        { id: 'e_2', text: 'Switch · e_2' },
      ],
    })
    const select = container.querySelector('select')
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual([
      'Link · e_1',
      'Switch · e_2',
    ])
    expect(select?.value).toBe('e_2')
  })

  it('calls onChange with the component type, the field, and the value', async () => {
    const onChange = vi.fn(() => Promise.resolve({ saved: true as const }))
    draw({ onChange })
    const input = text('count')
    expect(input).toBeDefined()
    if (input) {
      type(input, '5')
    }
    await act(async () => {
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(COUNTER_TYPE, COUNT_FIELD, 5)
  })

  it('disables the controls with no onChange', () => {
    draw()
    expect(text('count')?.disabled).toBe(true)
  })

  it('calls onClear with the component type and the field', async () => {
    const onClear = vi.fn(() => Promise.resolve({ saved: true as const }))
    draw({ onClear })
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Clear count"]')
    act(() => {
      button?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onClear).toHaveBeenCalledExactlyOnceWith(COUNTER_TYPE, COUNT_FIELD)
  })

  it('disables Clear with no onClear', () => {
    draw()
    expect(container.querySelector('button[aria-label="Clear count"]')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows the zero state with no entity', () => {
    draw({ entity: undefined })
    expect(container.textContent).toContain('Inspector')
    expect(container.textContent).toContain('Select an entity to change it.')
    expect(container.querySelector('fieldset')).toBeNull()
    expect(container.querySelector('h2')).toBeNull()
  })
})
