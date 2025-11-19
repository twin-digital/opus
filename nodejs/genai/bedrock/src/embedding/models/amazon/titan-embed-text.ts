import type { EmbeddingModelAdapter } from '../../embedding-api.js'

/**
 * Titan Embed Text input request format.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html
 */
export interface TitanEmbedTextRequest {
  /**
   * Text to convert to an embedding.
   */
  inputText: string

  /**
   * Number of dimensions for the output embedding.
   * Accepted values: 1024 (default), 512, 256
   */
  dimensions?: number

  /**
   * Flag indicating whether or not to normalize the output embedding.
   * @default true
   */
  normalize?: boolean

  /**
   * List of embedding types to return.
   * Accepts "float", "binary", or both.
   * @default ["float"]
   */
  embeddingTypes?: ('float' | 'binary')[]
}

/**
 * Titan Embed Text output response format.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html
 */
export interface TitanEmbedTextResponse {
  /**
   * An array that represents the embedding vector of the input.
   * This will always be type float.
   */
  embedding: number[]

  /**
   * The number of tokens in the input.
   */
  inputTextTokenCount: number

  /**
   * A dictionary or map of the embedding list.
   * Depends on the input, lists "float", "binary", or both.
   * This field will always appear, even if embeddingTypes was not specified.
   */
  embeddingsByType: {
    float?: number[]
    binary?: number[]
  }
}

export const adapter: EmbeddingModelAdapter<TitanEmbedTextRequest, TitanEmbedTextResponse> = {
  createRequest: (request) => request,

  parseResponse: (response) => {
    return {
      embedding: response.embedding,
      inputTextTokenCount: response.inputTextTokenCount,
    }
  },
}
