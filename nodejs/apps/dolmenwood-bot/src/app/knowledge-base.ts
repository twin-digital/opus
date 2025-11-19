import { invokeEmbeddingModel } from '@twin-digital/bedrock'
import { createHnswKnowledgeBase, type CreateEmbeddingFn } from '@twin-digital/genai-core'
import type { KnowledgeBase } from '@twin-digital/genai-core'

/**
 * Creates a GenAI Core "CreateEmbeddingFn" backed by a particular Bedrock foundational model.
 * @param modelId
 * @returns
 */
export const createBedrockEmbeddingFunction =
  (modelId: string): CreateEmbeddingFn =>
  async (text) => {
    const result = await invokeEmbeddingModel(modelId, {
      inputText: text,
    })
    return result.embedding
  }

export const createKnowledgeBase = async (path: string, embeddingModelId: string): Promise<KnowledgeBase> => {
  console.log('modid', embeddingModelId)
  return await createHnswKnowledgeBase(path, createBedrockEmbeddingFunction(embeddingModelId))
}
