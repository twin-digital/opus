import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppBar } from './AppBar.js'

const render = (title: string) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<AppBar title={title} />)
  return container
}

describe('AppBar', () => {
  it('is a header element with the night surface and on-night text', () => {
    const header = render('Wishem').firstElementChild
    expect(header?.tagName).toBe('HEADER')
    expect(header?.classList.contains('bg-night')).toBe(true)
    expect(header?.classList.contains('text-on-night')).toBe(true)
  })

  it('shows the title in a heading 1 in the display typeface, in lowercase by style', () => {
    const heading = render('Wishem').querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.classList.contains('font-display')).toBe(true)
    expect(heading?.classList.contains('lowercase')).toBe(true)
  })

  it('keeps the text of the heading as the title was given', () => {
    const heading = render('Wishem').querySelector('h1')
    heading?.querySelector('[aria-hidden="true"]')?.remove()
    expect(heading?.textContent).toBe('Wishem')
  })

  it('draws the full stop in maker, hidden from a screen reader', () => {
    const stop = render('Wishem').querySelector('h1 [aria-hidden="true"]')
    expect(stop?.textContent).toBe('.')
    expect(stop?.classList.contains('text-maker')).toBe(true)
  })

  it('cuts a long title with an ellipsis', () => {
    const heading = render('A very long title').querySelector('h1')
    expect(heading?.classList.contains('truncate')).toBe(true)
  })
})
