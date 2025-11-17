import type { EmbeddingModelAdapter } from './embedding-api.js'
import { adapter as titanEmbedTextAdapter } from './models/amazon/titan-embed-text.js'

const embeddingModelAdapters = [
  {
    adapter: titanEmbedTextAdapter,
    match: /^amazon\.titan-embed-text-.*/,
  },
]

/**
 * Gets the appropriate embedding model adapter for the given model ID.
 * @param modelId The Bedrock model ID
 * @returns The matching adapter, or undefined if no adapter matches
 */
export const getEmbeddingModelAdapter = (
  modelId: string,
): EmbeddingModelAdapter | undefined => {
  const matched = embeddingModelAdapters.find((entry) =>
    entry.match.test(modelId),
  )
  return matched?.adapter
}
