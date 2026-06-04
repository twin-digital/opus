import type { AdventureResult } from '@thrashplay/fw-simulation'

/** Anything that turns a prompt into completion text. The seam where the LLM plugs in. */
export type Llm = (prompt: string) => Promise<string>

/**
 * Build the chronicler's prompt from the pinned adventure result — and nothing else.
 *
 * The chronicler may invent narrative texture, but it is told that the *only* established fact
 * is the outcome. The gap between that single fact and a satisfying story is exactly what we
 * read the output to measure: whatever the model is forced to invent is a candidate for the
 * sim to start pinning.
 */
export const buildPrompt = (result: AdventureResult): string =>
  [
    'You are the Chronicler, who records the histories of a world.',
    `An adventure has just concluded. The only established fact is its outcome: ${
      result.success ? 'SUCCESS' : 'FAILURE'
    }.`,
    'Write a single short paragraph (3-5 sentences) recording this adventure as in-world history.',
    'Invent only the minimum detail needed for a readable account, and never contradict the outcome.',
  ].join('\n\n')

/** Resolve a pinned adventure result into prose via the given {@link Llm}. */
export const chronicle = async (result: AdventureResult, llm: Llm): Promise<string> =>
  (await llm(buildPrompt(result))).trim()
