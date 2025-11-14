import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { bedrock } from '../client.js'
import type { InferenceRequest, InferenceResponse } from './inference-api.js'
import { getModelAdapater } from './model-adapters.js'

/**
 * Invokes an LLM for text generation using the specified model.
 * @param modelId AWS Bedrock model ID of the inference model.
 * @param request Request input containing the prompt and generation parameters.
 * @returns The generated text response.
 */
export const invokeInferenceModel = async (
  modelId: string,
  request: InferenceRequest,
): Promise<InferenceResponse> => {
  const adapter = getModelAdapater(modelId)
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
