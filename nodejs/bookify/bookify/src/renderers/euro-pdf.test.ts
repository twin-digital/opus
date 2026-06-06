import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEuroPdfRenderer } from './euro-pdf.js'

const API_KEY = 'super-secret-api-key'

describe('makeEuroPdfRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the response ArrayBuffer on an ok response', async () => {
    const buffer = new ArrayBuffer(8)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    })
    vi.stubGlobal('fetch', fetchMock)

    const render = makeEuroPdfRenderer({ apiKey: API_KEY })
    const result = await render('<html></html>')

    expect(result).toBe(buffer)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws an error including the status and body text on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: vi.fn().mockResolvedValue('invalid api key'),
      arrayBuffer: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const render = makeEuroPdfRenderer({ apiKey: API_KEY })

    await expect(render('<html></html>')).rejects.toThrow(/403/)
    await expect(render('<html></html>')).rejects.toThrow(/Forbidden/)
    await expect(render('<html></html>')).rejects.toThrow(/invalid api key/)
  })

  it('does not leak the API key in the thrown error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue('boom'),
      arrayBuffer: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const render = makeEuroPdfRenderer({ apiKey: API_KEY })

    await expect(render('<html></html>')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(API_KEY) as unknown as string }),
    )
  })

  it('handles a response body that fails to read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: vi.fn().mockRejectedValue(new Error('stream error')),
      arrayBuffer: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const render = makeEuroPdfRenderer({ apiKey: API_KEY })

    await expect(render('<html></html>')).rejects.toThrow(/502/)
    await expect(render('<html></html>')).rejects.toThrow(/unable to read response body/)
  })
})
