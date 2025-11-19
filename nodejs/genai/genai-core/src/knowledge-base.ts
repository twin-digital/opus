import type { VectorStore } from '@langchain/core/vectorstores'
import type { KnowledgeBase, KnowledgeBaseSearchOptions, KnowledgeBaseSearchResult } from './rag.js'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'

/**
 * Embeddings function used to convert a text string into an embeddings vector. The same embeddings function (and
 * parameters) must be used when storing content and performing queries.
 */
export type CreateEmbeddingFn = (text: string) => Promise<number[]>

export class VectorStoreKnowledgeBase implements KnowledgeBase {
  /**
   * Creates a new knowledge based backed by a langchain vectorstore.
   *
   * @param _store Vector store containing the embedded context documents.
   * @param _embed Function used to create embeddings from input text.
   */
  public constructor(private _store: VectorStore) {}

  public async search(
    query: string,
    { limit = 10 }: KnowledgeBaseSearchOptions = {},
  ): Promise<KnowledgeBaseSearchResult[]> {
    const results = await this._store.similaritySearchWithScore(query, limit)
    return results.map(([document, score]) => ({
      content: document.pageContent,
      metadata: document.metadata,
      score,
    }))
  }
}

/**
 * Creates a KnowledgeBase backed by the HNSW graph stored at `storePath`. Will throw an error if there is no graph
 * data stored at that path, or if there is an error loading it.
 *
 * @param storePath Path to the directory containing the HNSW store data.
 * @param createEmbedding Function used to create vector embeddings from text.
 * @returns The Knowledge Base.
 */
export const createHnswKnowledgeBase = async (
  storePath: string,
  createEmbedding: CreateEmbeddingFn,
): Promise<KnowledgeBase> => {
  const store = await HNSWLib.load(storePath, {
    embedQuery: createEmbedding,
    embedDocuments: async (texts: string[]) => Promise.all(texts.map((t) => createEmbedding(t))),
  })
  return new VectorStoreKnowledgeBase(store)
}
