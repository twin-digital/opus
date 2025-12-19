import type { DocumentRendererFn } from '../rendering.js'

export interface EuroPdfOptions {
  /**
   * EuroPDF API key.
   */
  apiKey: string

  /**
   * Whether to generate a test document or not. This value is ignored if the API was created with the "force test mode"
   * setting enabled. In that case, all generated documents use test mode.
   *
   * @defaultValue false
   */
  test?: boolean
}

export const makeEuroPdfRenderer =
  ({ apiKey, test }: EuroPdfOptions): DocumentRendererFn =>
  async (html) => {
    const url = `https://api.europdf.eu/v1/docs?api_key=${apiKey}`
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*, application/json' },
      body: JSON.stringify({
        document_content: html,
        test: test,
      }),
    }

    const response = await fetch(url, options)
    return response.arrayBuffer()
  }
