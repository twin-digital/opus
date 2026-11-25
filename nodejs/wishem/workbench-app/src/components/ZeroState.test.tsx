import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ZeroState } from './ZeroState.js'

const render = () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<ZeroState label='Workbench' message='Nothing to show yet.' />)
  return container
}

describe('ZeroState', () => {
  it('shows the label, then the message', () => {
    const texts = Array.from(render().querySelectorAll('p')).map((p) => p.textContent)
    expect(texts).toEqual(['Workbench', 'Nothing to show yet.'])
  })

  it('draws the label as an uppercase mono label', () => {
    const label = render().querySelector('p')
    for (const name of ['font-mono', 'text-label', 'uppercase']) {
      expect(label?.classList.contains(name), name).toBe(true)
    }
  })

  it('centers the texts', () => {
    const root = render().firstElementChild
    for (const name of ['grid', 'place-content-center', 'text-center']) {
      expect(root?.classList.contains(name), name).toBe(true)
    }
  })

  it('uses fg-muted for both texts', () => {
    for (const p of Array.from(render().querySelectorAll('p'))) {
      expect(p.classList.contains('text-fg-muted')).toBe(true)
    }
  })
})
