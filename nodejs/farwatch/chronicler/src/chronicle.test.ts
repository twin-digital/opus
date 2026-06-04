import { describe, it, expect } from 'vitest'

import { buildPrompt, chronicle } from './chronicle.js'

describe('chronicle', () => {
  it('buildPrompt states the pinned outcome', () => {
    expect(buildPrompt({ roll: 0.1, target: 0.5, success: true })).toMatch(/SUCCESS/)
    expect(buildPrompt({ roll: 0.9, target: 0.5, success: false })).toMatch(/FAILURE/)
  })

  it('feeds the prompt to the llm and trims the result', async () => {
    const echo: (prompt: string) => Promise<string> = (prompt) =>
      Promise.resolve(`  ${prompt.includes('SUCCESS') ? 'a triumph' : 'a defeat'}  `)
    expect(await chronicle({ roll: 0.1, target: 0.5, success: true }, echo)).toBe('a triumph')
    expect(await chronicle({ roll: 0.9, target: 0.5, success: false }, echo)).toBe('a defeat')
  })
})
