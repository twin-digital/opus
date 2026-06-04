import { bedrock } from './bedrock.js'
import type { Llm } from './chronicle.js'
import { claudeCli } from './claude-cli.js'

/** Available LLM backends, keyed by the value of the `CHRONICLER_LLM` env var. */
export const BACKENDS: Record<string, Llm | undefined> = {
  bedrock,
  'claude-cli': claudeCli,
}

/**
 * Resolve the LLM backend named by `CHRONICLER_LLM`. No default — the choice is always
 * explicit, so a missing or unknown value throws rather than silently picking one.
 */
export const selectLlm = (): Llm => {
  const names = Object.keys(BACKENDS).join(', ')
  const name = process.env.CHRONICLER_LLM
  if (!name) {
    throw new Error(`CHRONICLER_LLM must be set (one of: ${names})`)
  }
  const llm = BACKENDS[name]
  if (!llm) {
    throw new Error(`unknown CHRONICLER_LLM "${name}" (expected one of: ${names})`)
  }
  return llm
}
