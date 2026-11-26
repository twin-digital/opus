import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { Divider } from './Divider.js'

describe('Divider', () => {
  const view = useRender()
  const root = () => view.container.firstElementChild

  it('gives each variant a different class set', () => {
    view.draw(<Divider variant='plain' />)
    const plain = root()?.className
    view.draw(<Divider variant='accent' />)
    expect(root()?.className).not.toBe(plain)
  })

  it('is a horizontal rule', () => {
    view.draw(<Divider />)
    expect(root()?.tagName).toBe('HR')
  })

  it('uses the plain variant by default', () => {
    view.draw(<Divider />)
    const byDefault = root()?.className
    view.draw(<Divider variant='plain' />)
    expect(byDefault).toBe(root()?.className)
  })
})
