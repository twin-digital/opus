import { afterEach, describe, it, expect, vi } from 'vitest'

import { ollama } from './ollama.js'

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ollama structured output', () => {
  it('passes `format` to the server only when a schema is supplied', async () => {
    const bodies: unknown[] = []
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'))
      return Promise.resolve(jsonResponse({ response: '{"ok":true}' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await ollama('prompt', { model: 'm' })
    expect(bodies[0]).not.toHaveProperty('format')

    const schema = { type: 'object', required: ['x'] }
    await ollama('prompt', { model: 'm', schema })
    expect((bodies[1] as { format?: unknown }).format).toEqual(schema)
  })
})
