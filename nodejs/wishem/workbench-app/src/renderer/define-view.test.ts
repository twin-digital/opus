import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineView } from './define-view.js'
import type { ViewProps } from './define-view.js'

const props = {
  title: { field: 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62', type: 'string' },
} as const

describe('defineView', () => {
  it('returns its argument', () => {
    const view = {
      componentType: 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34',
      props,
      render: () => null,
    }

    expect(defineView(view)).toBe(view)
  })

  it('types the prop of a string field as a string or no value', () => {
    const view = defineView({
      componentType: 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34',
      props,
      render: (viewProps) => {
        expectTypeOf(viewProps.title).toEqualTypeOf<string | undefined>()
        return null
      },
    })

    expectTypeOf<ViewProps<typeof view.props>>().toEqualTypeOf<{ readonly title: string | undefined }>()
  })

  it('rejects a prop that is not declared', () => {
    defineView({
      componentType: 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34',
      props,
      render: (viewProps) => {
        // @ts-expect-error the prop `subtitle` is not declared
        void viewProps.subtitle
        return null
      },
    })
  })
})
