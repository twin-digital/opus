import { describe, expect, it } from 'vitest'
import { useRender } from '../test/render.js'
import { Badge, type BadgeVariant } from './Badge.js'

const variants: BadgeVariant[] = ['neutral', 'maker', 'spirit', 'accent', 'success', 'warning', 'danger', 'info']

describe('Badge', () => {
  const view = useRender()
  const root = () => view.container.firstElementChild

  it('gives each variant a different class set', () => {
    const sets = variants.map((variant) => {
      view.draw(<Badge variant={variant}>Text</Badge>)
      return root()?.className
    })
    expect(new Set(sets).size).toBe(variants.length)
  })

  it('uses the neutral variant by default', () => {
    view.draw(<Badge>Text</Badge>)
    const byDefault = root()?.className
    view.draw(<Badge variant='neutral'>Text</Badge>)
    expect(byDefault).toBe(root()?.className)
  })

  it('shows its text', () => {
    view.draw(<Badge variant='danger'>Failed</Badge>)
    expect(root()?.textContent).toBe('Failed')
  })
})
