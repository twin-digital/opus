import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProductViews } from './product-views.js'

type Fetch = typeof globalThis.fetch

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const answer = (body: unknown, status = 200) => (() => jsonResponse(body, status)) as unknown as Fetch

const sidecar = (componentType: string) => ({ default: { kind: 'react', componentType } })
const view = () => ({ default: () => null })

describe('loadProductViews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('collects the views of a list with two pairs', async () => {
    const modules: Record<string, unknown> = {
      '/a/Color.view.json': sidecar('ct_color'),
      '/a/Color.tsx': view(),
      '/a/Counter.view.json': sidecar('ct_counter'),
      '/a/Counter.tsx': view(),
    }
    const fetch = vi.fn(() =>
      jsonResponse({
        views: [
          { sidecar: '/a/Color.view.json', view: '/a/Color.tsx' },
          { sidecar: '/a/Counter.view.json', view: '/a/Counter.tsx' },
        ],
      }),
    )
    const result = await loadProductViews({
      fetch: fetch as unknown as Fetch,
      load: (url) => Promise.resolve(modules[url]),
    })
    expect(fetch).toHaveBeenCalledWith('/@wishem/product-views.json')
    expect('error' in result).toBe(false)
    expect([...result.views.keys()].sort()).toEqual(['ct_color', 'ct_counter'])
    expect(result.views.get('ct_color')?.sidecar).toBe('Color.view.json')
  })

  it('gives an empty table for an empty list', async () => {
    const result = await loadProductViews({
      fetch: answer({ views: [] }),
      load: () => Promise.reject(new Error('no load')),
    })
    expect(result.views.size).toBe(0)
    expect('error' in result).toBe(false)
  })

  it('gives an empty table for a 404', async () => {
    const result = await loadProductViews({
      fetch: (() => Promise.resolve(new Response('', { status: 404 }))) as unknown as Fetch,
    })
    expect(result.views.size).toBe(0)
    expect('error' in result).toBe(false)
  })

  it('gives an error for a sidecar that is not correct', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const modules: Record<string, unknown> = { '/a/Bad.view.json': { default: 'text' }, '/a/Bad.tsx': view() }
    const result = await loadProductViews({
      fetch: answer({ views: [{ sidecar: '/a/Bad.view.json', view: '/a/Bad.tsx' }] }),
      load: (url) => Promise.resolve(modules[url]),
    })
    expect(result.views.size).toBe(0)
    expect('error' in result && result.error).toBe('The views of the product are not correct.')
    expect(error).toHaveBeenCalledOnce()
    expect(String(error.mock.calls[0]?.[0])).toContain('Bad.view.json')
  })

  it('gives an error when a file does not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await loadProductViews({
      fetch: answer({ views: [{ sidecar: '/a/X.view.json', view: '/a/X.tsx' }] }),
      load: () => Promise.reject(new Error('boom')),
    })
    expect('error' in result && result.error).toBe('The views of the product are not correct.')
  })

  it('gives an error for an answer that is not a list, a status that is not 404, and a failed request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrong = await loadProductViews({ fetch: answer({ views: 3 }) })
    expect('error' in wrong).toBe(true)
    const failed = await loadProductViews({
      fetch: (() => Promise.resolve(new Response('', { status: 500 }))) as unknown as Fetch,
    })
    expect('error' in failed).toBe(true)
    const thrown = await loadProductViews({ fetch: (() => Promise.reject(new Error('offline'))) as unknown as Fetch })
    expect('error' in thrown).toBe(true)
  })
})
