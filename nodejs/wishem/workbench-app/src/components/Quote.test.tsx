import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { Quote } from './Quote.js'

describe('Quote', () => {
  const view = useRender()

  it('shows its text and its source', () => {
    view.draw(<Quote cite='rules.md, R7'>A kit is what the first game leaves behind.</Quote>)
    expect(view.container.textContent).toContain('A kit is what the first game leaves behind.')
    expect(view.container.querySelector('cite')?.textContent).toBe('rules.md, R7')
  })

  it('draws no source element when it has no source', () => {
    view.draw(<Quote>A kit is what the first game leaves behind.</Quote>)
    expect(view.container.querySelector('cite')).toBeNull()
  })
})
