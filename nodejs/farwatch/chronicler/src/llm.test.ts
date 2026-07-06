import { describe, it, expect } from 'vitest'

import { selectLlm } from './llm.js'

/** Run `fn` with `CHRONICLER_LLM` set to `value` (or unset), then restore the prior value. */
const withLlmEnv = (value: string | undefined, fn: () => void): void => {
  const prev = process.env.CHRONICLER_LLM
  if (value === undefined) {
    delete process.env.CHRONICLER_LLM
  } else {
    process.env.CHRONICLER_LLM = value
  }
  try {
    fn()
  } finally {
    if (prev === undefined) {
      delete process.env.CHRONICLER_LLM
    } else {
      process.env.CHRONICLER_LLM = prev
    }
  }
}

describe('selectLlm', () => {
  it('throws when CHRONICLER_LLM is unset (no default)', () => {
    withLlmEnv(undefined, () => {
      expect(() => selectLlm()).toThrow(/CHRONICLER_LLM must be set/)
    })
  })

  it('throws on an unknown backend', () => {
    withLlmEnv('nope', () => {
      expect(() => selectLlm()).toThrow(/unknown CHRONICLER_LLM/)
    })
  })

  it('returns a function for each known backend', () => {
    for (const name of ['bedrock', 'claude-cli', 'ollama']) {
      withLlmEnv(name, () => {
        expect(typeof selectLlm()).toBe('function')
      })
    }
  })
})
