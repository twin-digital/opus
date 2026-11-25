import { describe, expect, it } from 'vitest'
import { collectViews, ViewCollectionError } from './collect-views.js'
import { defineView } from './define-view.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'

const makeView = (componentType: string) => defineView({ componentType, props: {}, render: () => null })

const catchError = (run: () => unknown): ViewCollectionError => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ViewCollectionError)
    return error as ViewCollectionError
  }
  throw new Error('no error was thrown')
}

describe('collectViews', () => {
  it('builds a table from the component type ID to the view and its file name', () => {
    const view = makeView(APP_BAR)

    const table = collectViews({ './views/AppBar.tsx': { default: view } })

    expect(table.size).toBe(1)
    expect(table.get(APP_BAR)).toEqual({ file: 'AppBar.tsx', view })
  })

  it('returns an empty table for no modules', () => {
    expect(collectViews({}).size).toBe(0)
  })

  it('does not collect a file that ends with .test.tsx', () => {
    const table = collectViews({
      './views/AppBar.test.tsx': { default: 'not a view' },
      './views/AppBar.tsx': { default: makeView(APP_BAR) },
    })

    expect([...table.keys()]).toEqual([APP_BAR])
  })

  it('names the two files and the ID for two views with one ID', () => {
    const error = catchError(() =>
      collectViews({
        './views/AppBar.tsx': { default: makeView(APP_BAR) },
        './views/Header.tsx': { default: makeView(APP_BAR) },
      }),
    )

    expect(error.message).toBe(
      `wishem: the views AppBar.tsx and Header.tsx declare the same component type ${APP_BAR}. No view is drawn.`,
    )
    expect(error.files).toEqual(['AppBar.tsx', 'Header.tsx'])
  })

  it('names the file when the default export is not a view object', () => {
    const error = catchError(() => collectViews({ './views/Bad.tsx': { default: { componentType: 1 } } }))

    expect(error.message).toBe('wishem: the file Bad.tsx has no default export from defineView. No view is drawn.')
    expect(error.files).toEqual(['Bad.tsx'])
  })

  it('names the file when the default export is absent', () => {
    const error = catchError(() => collectViews({ './views/Empty.tsx': {} }))

    expect(error.message).toContain('Empty.tsx')
  })

  it('names the file when the module is not an object', () => {
    const error = catchError(() => collectViews({ './views/Null.tsx': null }))

    expect(error.message).toContain('Null.tsx')
  })

  it('rejects a view with a missing render function', () => {
    const error = catchError(() =>
      collectViews({ './views/NoRender.tsx': { default: { componentType: APP_BAR, props: {} } } }),
    )

    expect(error.message).toContain('NoRender.tsx')
  })
})
