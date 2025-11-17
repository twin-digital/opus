import type { TextExtractor } from './text-extraction/api.js'
import { TextExtractorChain } from './text-extraction/text-extractor-chain.js'
import { TextFileTextExtractor } from './text-extraction/text-file-text-extractor.js'

export * from './text-extraction/api.js'

/**
 * Creates a {@link TextExtractor} which can extract text content from arbitrary data sources. The result object
 * will delegate to a chain of type-specific {@link TextExtractor} instances, using the first one that supports a given
 * input data source.
 *
 * @param extractors Set of extractors to use. Defaults to a list of all built-in implementations with default settings.
 * @returns
 */
export const createTextExtractor = (
  extractors = [new TextFileTextExtractor()],
): TextExtractor => new TextExtractorChain(extractors)
