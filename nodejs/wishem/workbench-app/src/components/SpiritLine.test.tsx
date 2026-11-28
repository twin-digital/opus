import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { SpiritLine } from './SpiritLine.js'

describe('SpiritLine', () => {
  const view = useRender()

  it('shows its text as it is', () => {
    view.draw(<SpiritLine>Done.</SpiritLine>)
    expect(view.container.textContent).toBe('Done.')
  })
})
