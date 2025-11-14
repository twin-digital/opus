/**
 * Generic input type used to performance inference using a bedrock model.
 */
export interface InferenceRequest {
  /**
   * Maximum number of tokens to generate in the response. How strictly this is enforced varies with model.
   * @default Model-specific, but probably dynamic.
   */
  maxTokens?: number

  /**
   * Prompt to pass to the LLM.
   */
  prompt: string
}

export interface InferenceResponse {
  /**
   * The generated text content.
   */
  content?: string
}

export interface ModelApiAdapter<TRequest = unknown> {
  /**
   * Converts a generic {@see InferenceInput} to a model-specific input body.
   */
  createRequest(request: InferenceRequest): TRequest

  /**
   * Parses the model-specific inference output into a {@see InferenceResponse} instance. Will throw an error if the
   * response type does not have the expected schema.
   */
  parseResponse(response: unknown): InferenceResponse
}
