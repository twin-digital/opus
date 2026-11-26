import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { Callout, type Status } from './Callout.js'

const variants: Status[] = ['success', 'warning', 'danger', 'info']

describe('Callout', () => {
  const view = useRender()
  const root = () => view.container.firstElementChild
  const title = () => view.container.querySelector('[data-slot="title"]')

  it('gives each variant a different class set', () => {
    const sets = variants.map((variant) => {
      view.draw(<Callout variant={variant}>Text</Callout>)
      return root()?.className
    })
    expect(new Set(sets).size).toBe(variants.length)
  })

  it('shows the title before the content', () => {
    view.draw(
      <Callout variant='warning' title='Check this.'>
        Two runs got stuck in room 3.
      </Callout>,
    )
    expect(title()?.textContent).toBe('Check this.')
    expect(root()?.textContent).toBe('Check this.Two runs got stuck in room 3.')
    expect(root()?.firstElementChild).toBe(title())
  })

  it('draws no title element with no title', () => {
    view.draw(<Callout variant='info'>Text</Callout>)
    expect(title()).toBeNull()
  })

  it('accepts a string and an element as children', () => {
    view.draw(<Callout variant='info'>Text</Callout>)
    expect(root()?.textContent).toBe('Text')
    view.draw(
      <Callout variant='info'>
        <em>Text</em>
      </Callout>,
    )
    expect(root()?.querySelector('em')?.textContent).toBe('Text')
  })
})
