import { describe, expect, it } from 'vitest'
import { collectViews, ViewCollectionError } from './collect-views.js'

const CLEAR_COLOR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'

const sidecar = (componentType: string, kind = 'pixi') => ({ default: { kind, componentType } })
const viewModule = () => ({ default: { create: () => ({}), update: () => undefined } })

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
  it('builds an entry with the sidecar file name, the component type ID, and the view', () => {
    const module = viewModule()

    const table = collectViews(
      { './views/ClearColor.view.json': sidecar(CLEAR_COLOR) },
      { './views/ClearColor.ts': module },
    )

    expect(table.size).toBe(1)
    expect(table.get(CLEAR_COLOR)).toEqual({
      sidecar: 'ClearColor.view.json',
      componentType: CLEAR_COLOR,
      view: module.default,
    })
  })

  it('returns an empty table for no files', () => {
    expect(collectViews({}, {}).size).toBe(0)
  })

  it('does not put a view file with no sidecar in the table, and gives no error', () => {
    expect(collectViews({}, { './views/Helper.ts': viewModule() }).size).toBe(0)
  })

  it('ignores a sidecar of the kind react, and gives no error', () => {
    const table = collectViews({ './views/ClearColor.view.json': sidecar(CLEAR_COLOR, 'react') }, {})

    expect(table.size).toBe(0)
  })

  it('names the sidecar for a sidecar with no view file', () => {
    const error = catchError(() => collectViews({ './views/Header.view.json': sidecar(CLEAR_COLOR) }, {}))

    expect(error.files).toEqual(['Header.view.json'])
    expect(error.message).toContain('Header.view.json')
  })

  it.each<[string, unknown]>([
    ['no default export', {}],
    ['a default export that is a function', { default: () => null }],
    ['a default export with no create function', { default: { update: () => undefined } }],
    ['a default export with no update function', { default: { create: () => ({}) } }],
    ['a create that is not a function', { default: { create: 1, update: () => undefined } }],
    ['a module that is not an object', null],
  ])('names the sidecar for a view file with %s', (_name, module) => {
    const error = catchError(() =>
      collectViews({ './views/Header.view.json': sidecar(CLEAR_COLOR) }, { './views/Header.ts': module }),
    )

    expect(error.files).toEqual(['Header.view.json'])
    expect(error.message).toContain('Header.ts')
  })

  it.each<[string, unknown]>([
    ['no componentType', { default: { kind: 'pixi' } }],
    ['a kind that is not text', { default: { kind: 1, componentType: CLEAR_COLOR } }],
    ['an array', { default: [] }],
    ['no default export', {}],
  ])('names the sidecar when it has %s', (_name, module) => {
    const error = catchError(() => collectViews({ './views/ClearColor.view.json': module }, {}))

    expect(error.files).toEqual(['ClearColor.view.json'])
    expect(error.message).toContain('ClearColor.view.json')
  })

  it('names the two sidecars for two sidecars with one component type ID', () => {
    const error = catchError(() =>
      collectViews(
        { './views/ClearColor.view.json': sidecar(CLEAR_COLOR), './views/Header.view.json': sidecar(CLEAR_COLOR) },
        { './views/ClearColor.ts': viewModule(), './views/Header.ts': viewModule() },
      ),
    )

    expect(error.files).toEqual(['ClearColor.view.json', 'Header.view.json'])
    expect(error.message).toContain(CLEAR_COLOR)
  })

  it('does not use a view file whose path ends with .test.ts', () => {
    const table = collectViews(
      { './views/ClearColor.view.json': sidecar(CLEAR_COLOR) },
      { './views/ClearColor.test.ts': viewModule(), './views/ClearColor.ts': viewModule() },
    )
    expect([...table.keys()]).toEqual([CLEAR_COLOR])

    const error = catchError(() =>
      collectViews(
        { './views/ClearColor.test.view.json': sidecar(CLEAR_COLOR) },
        { './views/ClearColor.test.ts': viewModule() },
      ),
    )
    expect(error.files).toEqual(['ClearColor.test.view.json'])
  })

  it('gives the same table for each order of the sidecars', () => {
    const other = 'ct_aaaaaaaa-8b47-4d0a-9e51-6c2f7a1b0d34'
    const modules = { './views/A.ts': viewModule(), './views/B.ts': viewModule() }
    const a = { './views/A.view.json': sidecar(CLEAR_COLOR) }
    const b = { './views/B.view.json': sidecar(other) }

    const first = collectViews({ ...a, ...b }, modules)
    const second = collectViews({ ...b, ...a }, modules)

    expect([...second.entries()]).toEqual([...first.entries()])
  })

  it('gives the same error for each order of two sidecars with one component type', () => {
    const modules = { './views/A.ts': viewModule(), './views/B.ts': viewModule() }
    const a = { './views/A.view.json': sidecar(CLEAR_COLOR) }
    const b = { './views/B.view.json': sidecar(CLEAR_COLOR) }

    expect(catchError(() => collectViews({ ...a, ...b }, modules)).files).toEqual(
      catchError(() => collectViews({ ...b, ...a }, modules)).files,
    )
  })
})
