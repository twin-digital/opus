import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { MakerLine } from './MakerLine.js'

describe('MakerLine', () => {
  const view = useRender()

  it('starts its text with a greater-than sign and a space', () => {
    view.draw(<MakerLine>make the bats flee</MakerLine>)
    expect(view.container.textContent).toBe('> make the bats flee')
  })
})
