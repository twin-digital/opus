import { invokeInferenceModel } from '@twin-digital/bedrock'
import type { KnowledgeBase } from '@twin-digital/genai-core'

interface DocumentMetadata {
  book: string
  pages?: number[]
  page?: number
  primaryPage?: number
  chunk: number
  version?: string
}

interface Context {
  text: string
  meta: DocumentMetadata
}

/**
 * Options for asking a rules question.
 */
export interface AskRulesQuestionOptions {
  /**
   * The knowledge base to search for relevant context.
   */
  knowledgeBase: KnowledgeBase

  /**
   * The question to ask.
   */
  question: string

  /**
   * AWS Bedrock model ID for the LLM.
   */
  llmModelId: string

  /**
   * Number of context chunks to retrieve.
   * @default 6
   */
  resultCount?: number

  /**
   * Maximum tokens for the LLM response.
   * @default 400
   */
  maxTokens?: number
}

function formatPageCitation(meta: DocumentMetadata): string {
  // Handle both old format (single page) and new format (pages array)
  const pages = meta.pages ?? (meta.page ? [meta.page] : [])

  if (pages.length === 0) {
    return 'p. ?'
  }

  if (pages.length === 1) {
    return `p. ${pages[0]}`
  }

  // Check if pages are consecutive
  const isConsecutive = pages.every((page, i) => i === 0 || page === pages[i - 1] + 1)

  if (isConsecutive) {
    return `pp. ${pages[0]}-${pages[pages.length - 1]}`
  }

  // Non-consecutive pages
  if (pages.length <= 3) {
    return `pp. ${pages.join(', ')}`
  }

  // Many non-consecutive pages, show range
  return `pp. ${pages[0]}-${pages[pages.length - 1]}`
}

function makePrompt(question: string, contexts: Context[]): string {
  const citeBlock = contexts
    .map((c, i) => `#${i + 1} [${c.meta.book} ${formatPageCitation(c.meta)}] ${c.text}`)
    .join('\n---\n')

  return `
You are a Dolmenwood referee assistant. Answer ONLY from the sources below. Prefer quoting the exact rule text briefly, then summarize. If the answer isn't present, say you don't know and suggest the nearest related rule.

SOURCES:
${citeBlock}

QUESTION:
${question}

FORMAT:
- 1–3 sentence answer
- Short quote(s) if helpful, with source(s) in format below
- Sources list
- Source format:
  - [<BOOK> p. NN] or [<BOOK> pp. NN, MM-OO, ...]
  - Use book abbreviations: DCB=Dolmenwood Cmpaign Book, DPB=Dolmenwood Player's Book, DMB=Dolmenwood Monster Book
`
}

/**
 * Asks a rules question using RAG (Retrieval-Augmented Generation).
 *
 * @param options Configuration for the question answering process
 * @returns The answer to the question
 */
export async function askRulesQuestion(options: AskRulesQuestionOptions): Promise<string> {
  const { knowledgeBase, question, llmModelId, resultCount = 6, maxTokens = 400 } = options

  // Search for similar chunks
  console.log(`Searching for relevant context (k=${resultCount})...`)
  const results = await knowledgeBase.search(question, { limit: resultCount })
  const contexts: Context[] = results.map((result) => ({
    text: result.content,
    meta: result.metadata as unknown as DocumentMetadata,
  }))

  // Create prompt
  const prompt = makePrompt(question, contexts)

  // Invoke the LLM
  console.log('Querying LLM...')
  const response = await invokeInferenceModel(llmModelId, {
    prompt,
    maxTokens,
  })

  return response.content ?? 'No response.'
}
