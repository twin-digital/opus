import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { bedrock } from '../core/client.js'
import type { EmbeddingRequest, EmbeddingResponse } from './embedding-api.js'
import { getEmbeddingModelAdapter } from './model-adapters.js'

/**
 * Calculates embeddings for an input string using the specified model.
 * @param modelId AWS Bedrock model ID of the embedding model.
 * @param request Request input containing the string to embed.
 * @returns The generated embeddings.
 */
export const invokeEmbeddingModel = async (
  modelId: string,
  request: EmbeddingRequest,
): Promise<EmbeddingResponse> => {
  const adapter = getEmbeddingModelAdapter(modelId)
  if (adapter === undefined) {
    throw new Error(`No adapter found for model: ${modelId}`)
  }

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      body: JSON.stringify(adapter.createRequest(request)),
      contentType: 'application/json',
    }),
  )

  const responseBody = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as unknown
  return adapter.parseResponse(responseBody)
}
