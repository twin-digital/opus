import type { Model } from '@thrashplay/wishem-core'
import { createStore, storeInputs } from '@thrashplay/wishem-core'
import { createHub, LinkClosedError, type Hub, type Port } from '@thrashplay/wishem-hub'
import type { InputPort } from '@thrashplay/wishem-renderer-react'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PRODUCT_ADD_REFERENCE,
  PRODUCT_CLEAR_FIELD,
  PRODUCT_REMOVE_REFERENCE,
  PRODUCT_SET_FIELD,
  ProductTool,
} from './ProductTool.js'

const SECOND_ENTITY = 'e_5f0c1d2e-aaaa-4bbb-8ccc-0123456789ab'

const productModel: Model = {
  definitions: [
    { id: COLOR_TYPE, label: 'Color', fields: [{ id: COLOR_FIELD, label: 'color', type: 'string' }] },
    { id: COUNTER_TYPE, label: 'Counter', fields: [{ id: COUNT_FIELD, label: 'count', type: 'number' }] },
  ],
  entities: [
    {
      id: SAMPLE_ENTITY,
      components: { [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' }, [COUNTER_TYPE]: { [COUNT_FIELD]: 0 } },
    },
    { id: SECOND_ENTITY, components: { [COUNTER_TYPE]: { [COUNT_FIELD]: 3 } } },
  ],
}

describe('ProductTool', () => {
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

  const setup = (withProduct = true) => {
    const hub: Hub = createHub({
      subsystems: [
        createStore({ model: { definitions: [], entities: [] } }),
        ...(withProduct ? [createStore({ id: 'product', model: productModel })] : []),
      ],
    })
    hub.start()
    const output: Port = hub.attach({ id: 'screen', kind: 'output' })
    const input: Port = hub.attach({ id: 'screen-input', kind: 'input' })
    return { hub, output, input }
  }

  const draw = (output: Pick<Port, 'read' | 'subscribe'>, input: InputPort | undefined) => {
    act(() => {
      root.render(<ProductTool port={output} input={input} />)
    })
  }
  const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'))
  const select = (index: number) => {
    act(() => {
      items()[index]?.click()
    })
  }
  const textbox = (name: string) => {
    const label = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent === name)
    return label?.control as HTMLInputElement
  }
  const type = (input: HTMLInputElement, value: string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const enter = async (input: HTMLInputElement) => {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
  }

  it('draws nothing when the port reads no part product', () => {
    const { output, input } = setup(false)
    draw(output, input)
    expect(container.innerHTML).toBe('')
  })

  it('shows one item for each entity and no selection at the start', () => {
    const { output, input } = setup()
    draw(output, input)
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([null, null])
    expect(container.textContent).toContain('Select an entity to change it.')
  })

  it('selects an entity and shows its inspector', () => {
    const { output, input } = setup()
    draw(output, input)
    select(0)
    expect(items()[0]?.getAttribute('aria-current')).toBe('true')
    expect(textbox('count').value).toBe('0')
  })

  it('has the input type of the store `product`', () => {
    expect(PRODUCT_SET_FIELD).toBe(
      storeInputs('product').setField({ entity: 'e', componentType: 'c', field: 'f', value: 1 }).type,
    )
  })

  it('has the clear input type of the store `product`', () => {
    expect(PRODUCT_CLEAR_FIELD).toBe(
      storeInputs('product').clearField({ entity: 'e', componentType: 'c', field: 'f' }).type,
    )
  })

  it('has the add-reference and remove-reference input types of the store `product`', () => {
    const payload = { entity: 'e', componentType: 'c', field: 'f', reference: 'r' }
    expect(PRODUCT_ADD_REFERENCE).toBe(storeInputs('product').addReference(payload).type)
    expect(PRODUCT_REMOVE_REFERENCE).toBe(storeInputs('product').removeReference(payload).type)
  })

  describe('a reference-list field', () => {
    const DECK_TYPE = 'ct_4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    const CARDS_FIELD = 'fld_5b2c3d4e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
    const DECK = 'e_1f2a3b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c'
    const listModel: Model = {
      definitions: [
        { id: DECK_TYPE, label: 'Deck', fields: [{ id: CARDS_FIELD, label: 'Cards', type: 'reference-list' }] },
        ...productModel.definitions,
      ],
      entities: [
        { id: DECK, components: { [DECK_TYPE]: { [CARDS_FIELD]: [SAMPLE_ENTITY] } } },
        ...productModel.entities,
      ],
    }
    const setupList = () => {
      const hub: Hub = createHub({
        subsystems: [
          createStore({ model: { definitions: [], entities: [] } }),
          createStore({ id: 'product', model: listModel }),
        ],
      })
      hub.start()
      const output: Port = hub.attach({ id: 'screen', kind: 'output' })
      const input: Port = hub.attach({ id: 'screen-input', kind: 'input' })
      return { hub, output, input }
    }
    const press = async (selector: string) => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(selector)?.click()
        await new Promise((done) => setTimeout(done, 0))
      })
    }
    const cards = (output: Port) => (output.read().product as Model).entities[0]?.components[DECK_TYPE]?.[CARDS_FIELD]

    it('sends one product/add-reference with the four keys, and shows the new item', async () => {
      const { hub, output, input } = setupList()
      draw(output, input)
      select(0)
      await press('[role="group"] button:not([aria-label])')
      const record = hub.record()
      expect(record).toHaveLength(1)
      expect(record[0]).toMatchObject({
        type: PRODUCT_ADD_REFERENCE,
        source: 'screen-input',
        payload: { entity: DECK, componentType: DECK_TYPE, field: CARDS_FIELD, reference: DECK },
      })
      expect(cards(output)).toEqual([SAMPLE_ENTITY, DECK])
      expect(container.querySelectorAll('[role="group"] li')).toHaveLength(2)
      expect(container.querySelector('[role="alert"]')).toBeNull()
    })

    it('sends one product/remove-reference with the four keys, and shows no item', async () => {
      const { hub, output, input } = setupList()
      draw(output, input)
      select(0)
      await press('button[aria-label^="Remove "]')
      const record = hub.record()
      expect(record).toHaveLength(1)
      expect(record[0]).toMatchObject({
        type: PRODUCT_REMOVE_REFERENCE,
        payload: { entity: DECK, componentType: DECK_TYPE, field: CARDS_FIELD, reference: SAMPLE_ENTITY },
      })
      expect(cards(output)).toEqual([])
      expect(container.textContent).toContain('empty list')
    })

    it('sends product/set-field for another row', async () => {
      const { hub, output, input } = setupList()
      draw(output, input)
      select(1)
      type(textbox('color'), 'red')
      await enter(textbox('color'))
      expect(hub.record().map((entry) => entry.type)).toEqual([PRODUCT_SET_FIELD])
    })

    it('shows the text of outcomeText after a refused list change', async () => {
      const { output } = setupList()
      const input: InputPort = { submit: () => Promise.resolve({ ok: false, reason: 'not-running', problems: [] }) }
      draw(output, input)
      select(0)
      await press('[role="group"] button:not([aria-label])')
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'The value is not saved. The workbench does not run. Start it, and try again.',
      )
    })

    it('disables the list control when there is no input port', () => {
      const { output } = setupList()
      draw(output, undefined)
      select(0)
      expect(container.querySelector('select')?.disabled).toBe(true)
    })
  })

  const clickClear = async (name: string) => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)?.click()
      await new Promise((done) => setTimeout(done, 0))
    })
  }

  it('sends one product/clear-field through the input port and shows no value', async () => {
    const { hub, output, input } = setup()
    draw(output, input)
    select(0)
    await clickClear('Clear count')
    const record = hub.record()
    expect(record).toHaveLength(1)
    expect(record[0]).toMatchObject({
      type: PRODUCT_CLEAR_FIELD,
      source: 'screen-input',
      payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD },
    })
    expect((output.read().product as Model).entities[0]?.components[COUNTER_TYPE]).toEqual({})
    expect(textbox('count').value).toBe('')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows the text of outcomeText for the outcome not-running after a clear', async () => {
    const { output } = setup()
    const input: InputPort = { submit: () => Promise.resolve({ ok: false, reason: 'not-running', problems: [] }) }
    draw(output, input)
    select(0)
    await clickClear('Clear count')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'The value is not cleared. The workbench does not run. Start it, and try again.',
    )
  })

  it('disables Clear when there is no input port', () => {
    const { output } = setup()
    draw(output, undefined)
    select(0)
    expect(container.querySelector('button[aria-label="Clear count"]')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('sends one input through the input port and the hub records the source of that port', async () => {
    const { hub, output, input } = setup()
    draw(output, input)
    select(0)
    type(textbox('count'), '7')
    await enter(textbox('count'))
    const record = hub.record()
    expect(record).toHaveLength(1)
    expect(record[0]).toMatchObject({
      type: PRODUCT_SET_FIELD,
      source: 'screen-input',
      payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value: 7 },
    })
    expect((output.read().product as Model).entities[0]?.components[COUNTER_TYPE]).toEqual({ [COUNT_FIELD]: 7 })
    expect(textbox('count').value).toBe('7')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows the text of the specification for the outcome not-running', async () => {
    const { output } = setup()
    const input: InputPort = { submit: () => Promise.resolve({ ok: false, reason: 'not-running', problems: [] }) }
    draw(output, input)
    select(0)
    type(textbox('count'), '7')
    await enter(textbox('count'))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'The value is not saved. The workbench does not run. Start it, and try again.',
    )
    expect(textbox('count').value).toBe('7')
  })

  it('names the value in the text for the outcome unknown', async () => {
    const { output } = setup()
    const input: InputPort = { submit: () => Promise.reject(new LinkClosedError()) }
    draw(output, input)
    select(0)
    type(textbox('count'), '7')
    await enter(textbox('count'))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Look at the value after it connects.')
  })

  it('disables each control when there is no input port', () => {
    const { output } = setup()
    draw(output, undefined)
    select(0)
    expect(textbox('count').disabled).toBe(true)
  })

  it('keeps the selection while the entity exists and follows a change of the part', async () => {
    const { output, input } = setup()
    draw(output, input)
    select(1)
    await act(async () => {
      await input.submit(
        storeInputs('product').setField({
          entity: SAMPLE_ENTITY,
          componentType: COUNTER_TYPE,
          field: COUNT_FIELD,
          value: 9,
        }),
      )
    })
    expect(items()[1]?.getAttribute('aria-current')).toBe('true')
    expect(textbox('count').value).toBe('3')
  })

  it('clears the selection and moves the focus to the list when the selected entity is removed', async () => {
    const { output, input } = setup()
    draw(output, input)
    select(1)
    act(() => {
      textbox('count').focus()
    })
    expect(document.activeElement).toBe(textbox('count'))
    await act(async () => {
      await input.submit(storeInputs('product').removeEntity(SECOND_ENTITY))
    })
    expect(items()).toHaveLength(1)
    expect(items()[0]?.getAttribute('aria-current')).toBeNull()
    expect(container.textContent).toContain('Select an entity to change it.')
    expect(document.activeElement).toBe(container.querySelector('nav'))
  })

  it('does not move the focus when the focus is not in the inspector', async () => {
    const { output, input } = setup()
    draw(output, input)
    select(1)
    act(() => {
      items()[0]?.focus()
    })
    await act(async () => {
      await input.submit(storeInputs('product').removeEntity(SECOND_ENTITY))
    })
    expect(document.activeElement).toBe(items()[0])
  })

  it('reads no part other than product', () => {
    const { output, input } = setup()
    const accessed: string[] = []
    const proxy = new Proxy(output.read(), {
      get: (target, key) => {
        accessed.push(String(key))
        return Reflect.get(target, key) as unknown
      },
    })
    draw({ read: () => proxy, subscribe: (listener) => output.subscribe(listener) }, input)
    select(0)
    expect(accessed.length).toBeGreaterThan(0)
    expect(new Set(accessed)).toEqual(new Set(['product']))
  })
})
