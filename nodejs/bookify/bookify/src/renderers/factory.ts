import type { RendererFactoryFn } from '../rendering.js'
import { makeEuroPdfRenderer } from './euro-pdf.js'

export const makeDefaultRendererFactory = (): RendererFactoryFn => (name, options) => {
  if (name === 'euro-pdf') {
    const apiKey = options.apiKey
    const test = options.test === 'test'

    if (!apiKey) {
      throw new Error('Required option not set: EURO_PDF_API_KEY')
    }

    return makeEuroPdfRenderer({
      apiKey,
      test,
    })
  }

  throw new Error(`Unsupported renderer type: ${name}`)
}
