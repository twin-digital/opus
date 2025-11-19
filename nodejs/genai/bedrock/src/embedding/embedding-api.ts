/**
 * Generic input type used to generate embeddings using a Bedrock model.
 */
export interface EmbeddingRequest {
  /**
   * Text to convert to an embedding.
   */
  inputText: string

  /**
   * Number of dimensions for the output embedding (model-specific options).
   */
  dimensions?: number
}

/**
 * Generic response type for embedding generation.
 */
export interface EmbeddingResponse {
  /**
   * The embedding vector as an array of floats.
   */
  embedding: number[]
}

/**
 * Model adapter interface for embedding models.
 */
export interface EmbeddingModelAdapter<TRequest = unknown, TResponse = unknown> {
  /**
   * Converts a generic {@see EmbeddingRequest} to a model-specific input body.
   */
  createRequest(request: EmbeddingRequest): TRequest

  /**
   * Parses the model-specific embedding output into an {@see EmbeddingResponse} instance.
   * Will throw an error if the response type does not have the expected schema.
   */
  parseResponse(response: TResponse): EmbeddingResponse
}
