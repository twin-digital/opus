import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StageFrame, type StageFrameProps } from './StageFrame.js'

const render = (props: StageFrameProps) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<StageFrame {...props} />)
  return container
}

describe('StageFrame', () => {
  it('is a section named Stage on ground, with a line border', () => {
    const section = render({ message: 'x' }).querySelector('section')
    expect(section?.getAttribute('aria-label')).toBe('Stage')
    for (const name of ['bg-ground', 'border', 'border-line', 'rounded-sm', 'p-4', 'min-h-[212px]']) {
      expect(section?.classList.contains(name), name).toBe(true)
    }
  })

  it('with a message, shows the zero state with the label Stage and the message', () => {
    const texts = Array.from(
      render({ message: 'Not running. Press Run to start the product.' }).querySelectorAll('p'),
    ).map((p) => p.textContent)
    expect(texts).toEqual(['Stage', 'Not running. Press Run to start the product.'])
  })

  it('with a message, shows no picture and no note', () => {
    const container = render({ message: 'm', note: 'The note.', children: <span id='picture' /> })
    expect(container.querySelector('#picture')).toBeNull()
    expect(container.textContent).not.toContain('The note.')
  })

  it('with a picture, shows the picture in an area that resets color and font', () => {
    const container = render({ children: <span id='picture'>Count 7</span> })
    const area = container.querySelector('#picture')?.parentElement
    expect(area?.textContent).toBe('Count 7')
    expect(area?.classList.contains('text-[initial]')).toBe(true)
    expect(area?.classList.contains('font-body')).toBe(true)
    expect(container.querySelector('p')).toBeNull()
  })

  it('with a note, shows the note in fg-muted below the picture', () => {
    const container = render({ note: 'The link is down.', children: <span id='picture' /> })
    const note = container.querySelector('p')
    expect(note?.textContent).toBe('The link is down.')
    expect(note?.classList.contains('text-fg-muted')).toBe(true)
    expect(container.querySelector('#picture')?.parentElement?.nextElementSibling).toBe(note)
  })
})
