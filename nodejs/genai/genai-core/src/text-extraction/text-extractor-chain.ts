import type { DataSource, TextExtractor } from './api.js'

/**
 * Chains multiple text extractors, trying each in order until one supports the input.
 */
export class TextExtractorChain implements TextExtractor {
  constructor(private readonly extractors: TextExtractor[]) {}

  public async supports(source: DataSource): Promise<boolean> {
    for (const extractor of this.extractors) {
      const supported = await extractor.supports(source)
      if (supported) {
        return true
      }
    }
    return false
  }

  public async extract(source: DataSource): Promise<string> {
    for (const extractor of this.extractors) {
      const supported = await extractor.supports(source)
      if (supported) {
        return extractor.extract(source)
      }
    }
    throw new Error('No extractor in chain supports this data source')
  }
}
