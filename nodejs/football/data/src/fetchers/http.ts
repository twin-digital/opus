/** Shared fetch helpers: fail loudly with the URL and status, never return partial garbage. */

export class FetchError extends Error {
  constructor(
    url: string,
    detail: string,
    readonly status?: number,
  ) {
    super(`Fetch failed for ${url}: ${detail}`)
    this.name = 'FetchError'
  }
}

const doFetch = async (url: string, headers: Record<string, string>): Promise<Response> => {
  const response = await fetch(url, { headers, redirect: 'follow' })
  if (!response.ok) {
    throw new FetchError(url, `HTTP ${response.status} ${response.statusText}`, response.status)
  }
  return response
}

export const fetchJson = async <T>(url: string, headers: Record<string, string> = {}): Promise<T> => {
  const response = await doFetch(url, headers)
  return (await response.json()) as T
}

export const fetchText = async (url: string, headers: Record<string, string> = {}): Promise<string> => {
  const response = await doFetch(url, headers)
  return await response.text()
}

/** A desktop-browser User-Agent for sources that reject default fetch UAs (FantasyPros). */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
