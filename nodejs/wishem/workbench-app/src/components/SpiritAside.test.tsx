import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { SpiritAside } from './SpiritAside.js'

describe('SpiritAside', () => {
  const view = useRender()

  it('starts with the signature', () => {
    view.draw(<SpiritAside>This is my favourite trick.</SpiritAside>)
    expect(view.container.textContent).toBe('Wishem: This is my favourite trick.')
    expect(view.container.querySelector('b')?.textContent).toBe('Wishem:')
  })
})
