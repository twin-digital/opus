/**
 * Represents all possible JSON types
 */
export type JsonType =
  | string
  | number
  | boolean
  | null
  | JsonType[]
  | { [key: string]: JsonType }

/**
 * Options for configuring a knowledge base search query.
 */
export interface KnowledgeBaseSearchOptions {
  /**
   * Maximum number of source chunks to return.
   * @default Implementation-specific default value
   */
  limit?: number
}

/**
 * A single result returned from a knowledge base search.
 */
export interface KnowledgeBaseSearchResult {
  /**
   * Content of this result chunk.
   */
  content: string

  /**
   * Optional metadata which was stored with this chunk.
   * Can contain arbitrary JSON-serializable data associated with the source material.
   */
  metadata?: Record<string, JsonType>

  /**
   * Similarity score for this result, indicating relevance to the query.
   * Higher scores indicate greater relevance.
   */
  score: number
}

/**
 * Interface for a searchable knowledge base that supports semantic queries.
 *
 * A KnowledgeBase provides methods to search and retrieve relevant information
 * based on natural language queries, returning scored results with optional metadata.
 */
export interface KnowledgeBase {
  /**
   * Retrieves information from a knowledge base using semantic search.
   *
   * @param query Text of the query to send to the knowledge base.
   * @param options Additional options to control how the query is performed.
   * @returns Promise resolving to an array of search results, ordered by relevance.
   */
  search(
    query: string,
    options?: KnowledgeBaseSearchOptions,
  ): Promise<KnowledgeBaseSearchResult[]>
}
