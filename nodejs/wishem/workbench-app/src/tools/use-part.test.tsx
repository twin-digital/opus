import { createStore } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePart } from './use-part.js'

const model = { definitions: [], entities: [] }

describe('usePart', () => {
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

  const setup = () => {
    const hub = createHub({
      subsystems: [createStore({ model }), createStore({ id: 'product', model })],
    })
    hub.start()
    const output = hub.attach({ id: 'screen', kind: 'output' })
    const input = hub.attach({ id: 'screen-input', kind: 'input' })
    const seen: unknown[] = []
    const Probe = ({ part }: { part: string }) => {
      seen.push(usePart(output, part))
      return null
    }
    act(() => {
      root.render(<Probe part='product' />)
    })
    return { output, input, seen, Probe }
  }

  it('gives the part with the key', () => {
    const { seen, output } = setup()
    expect(seen).toEqual([output.read().product])
    expect(seen[0]).toEqual(model)
  })

  it('draws again when the part changes by identity', async () => {
    const { seen, input } = setup()
    await act(async () => {
      await input.submit({
        type: 'product/add-entity',
        payload: { entity: { id: 'e_5f0c1d2e-aaaa-4bbb-8ccc-0123456789ab', components: {} } },
      })
    })
    expect(seen).toHaveLength(2)
    expect(seen[1]).not.toBe(seen[0])
    expect((seen[1] as typeof model).entities).toHaveLength(1)
  })

  it('does not draw again when a different part changes', async () => {
    const { seen, input } = setup()
    await act(async () => {
      await input.submit({
        type: 'store/add-entity',
        payload: { entity: { id: 'e_5f0c1d2e-aaaa-4bbb-8ccc-0123456789ab', components: {} } },
      })
    })
    expect(seen).toHaveLength(1)
  })

  it('gives no value for a part that the port does not read', () => {
    const { seen, Probe } = setup()
    act(() => {
      root.render(<Probe part='missing' />)
    })
    expect(seen.at(-1)).toBeUndefined()
  })
})
