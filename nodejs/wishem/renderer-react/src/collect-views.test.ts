import { describe, expect, it } from 'vitest'
import { collectViews, ViewCollectionError } from './collect-views.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'

const sidecar = (componentType: string, kind = 'react') => ({ default: { kind, componentType } })
const viewModule = () => ({ default: (): null => null })

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
  it('builds an entry with the sidecar file name, the component type ID, and the function', () => {
    const module = viewModule()

    const table = collectViews({ './views/AppBar.view.json': sidecar(APP_BAR) }, { './views/AppBar.tsx': module })

    expect(table.size).toBe(1)
    expect(table.get(APP_BAR)).toEqual({ sidecar: 'AppBar.view.json', componentType: APP_BAR, view: module.default })
  })

  it('returns an empty table for no files', () => {
    expect(collectViews({}, {}).size).toBe(0)
  })

  it('does not put a view file with no sidecar in the table, and gives no error', () => {
    const table = collectViews({}, { './views/Helper.tsx': viewModule() })

    expect(table.size).toBe(0)
  })

  it('does not put a sidecar of a different kind in the table, and gives no error', () => {
    const table = collectViews({ './views/AppBar.view.json': sidecar(APP_BAR, 'native') }, {})

    expect(table.size).toBe(0)
  })

  it('names the sidecar for a sidecar with no view file', () => {
    const error = catchError(() => collectViews({ './views/Header.view.json': sidecar(APP_BAR) }, {}))

    expect(error.files).toEqual(['Header.view.json'])
    expect(error.message).toBe('wishem: the sidecar Header.view.json has no view file Header.tsx. No view is drawn.')
  })

  it.each([
    ['no default export', {}],
    ['a default export that is not a function', { default: { render: () => null } }],
    ['a module that is not an object', null],
  ])('names the sidecar for a view file with %s', (_name, module) => {
    const error = catchError(() =>
      collectViews({ './views/Header.view.json': sidecar(APP_BAR) }, { './views/Header.tsx': module }),
    )

    expect(error.files).toEqual(['Header.view.json'])
    expect(error.message).toBe(
      'wishem: the view file Header.tsx of the sidecar Header.view.json has no default export that is a function. No view is drawn.',
    )
  })

  it.each([
    ['no componentType', { default: { kind: 'react' } }],
    ['a kind that is not text', { default: { kind: 1, componentType: APP_BAR } }],
    ['an array', { default: [] }],
    ['no default export', {}],
    ['a module that is not an object', null],
  ])('names the sidecar when parseSidecar rejects %s', (_name, module) => {
    const error = catchError(() => collectViews({ './views/AppBar.view.json': module }, {}))

    expect(error.files).toEqual(['AppBar.view.json'])
    expect(error.message).toBe(
      'wishem: the sidecar AppBar.view.json is not a JSON object with a "kind" and a "componentType" that are text. No view is drawn.',
    )
  })

  it('names the two sidecars and the ID for two sidecars with one component type ID', () => {
    const error = catchError(() =>
      collectViews(
        { './views/AppBar.view.json': sidecar(APP_BAR), './views/Header.view.json': sidecar(APP_BAR) },
        { './views/AppBar.tsx': viewModule(), './views/Header.tsx': viewModule() },
      ),
    )

    expect(error.files).toEqual(['AppBar.view.json', 'Header.view.json'])
    expect(error.message).toBe(
      `wishem: the sidecars AppBar.view.json and Header.view.json name the same component type ${APP_BAR}. No view is drawn.`,
    )
  })

  it('names the two sidecars in the order of their paths', () => {
    const error = catchError(() =>
      collectViews(
        { './views/Header.view.json': sidecar(APP_BAR), './views/AppBar.view.json': sidecar(APP_BAR) },
        { './views/AppBar.tsx': viewModule(), './views/Header.tsx': viewModule() },
      ),
    )

    expect(error.files).toEqual(['AppBar.view.json', 'Header.view.json'])
  })

  it('does not use a view file whose path ends with .test.tsx', () => {
    const table = collectViews(
      { './views/AppBar.view.json': sidecar(APP_BAR) },
      { './views/AppBar.test.tsx': viewModule(), './views/AppBar.tsx': viewModule() },
    )
    expect([...table.keys()]).toEqual([APP_BAR])

    const error = catchError(() =>
      collectViews({ './views/AppBar.test.view.json': sidecar(APP_BAR) }, { './views/AppBar.test.tsx': viewModule() }),
    )
    expect(error.files).toEqual(['AppBar.test.view.json'])
  })
})
