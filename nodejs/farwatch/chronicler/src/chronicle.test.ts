import { describe, it, expect } from 'vitest'

import type { Adventure, Outcome } from '@thrashplay/fw-simulation'

import { buildPrompt, chronicle, loadChronicleTemplate } from './chronicle.js'

/** A degenerate one-trial adventure with the given overall outcome. */
const oneTrial = (outcome: Outcome): Adventure => ({
  trials: [
    { approach: 'combat', check: { roll: outcome === 'success' ? 0.123456 : 0.987654, target: 0.5, outcome }, outcome },
  ],
  outcome,
})

describe('chronicle', () => {
  it('fills {{adventure}} with the chronicle-legal view: approach + outcome, no dice', () => {
    // A bare `{{adventure}}` template renders to exactly the projected JSON record.
    const rendered = buildPrompt(oneTrial('failure'), '{{adventure}}')
    expect(rendered).toContain('"approach": "combat"')
    expect(rendered).toContain('"outcome": "failure"')
    // The resolver's mechanics never reach the model: no roll, target, or check.
    expect(rendered).not.toContain('roll')
    expect(rendered).not.toContain('target')
    expect(rendered).not.toContain('check')
    expect(rendered).not.toContain('0.987654')
  })

  it('keeps trials in order', () => {
    const adv: Adventure = {
      trials: [
        { approach: 'stealth', check: { roll: 0.1, target: 0.5, outcome: 'success' }, outcome: 'success' },
        { approach: 'might', check: { roll: 0.9, target: 0.5, outcome: 'failure' }, outcome: 'failure' },
      ],
      outcome: 'failure',
    }
    const rendered = buildPrompt(adv, '{{adventure}}')
    expect(rendered.indexOf('"approach": "stealth"')).toBeLessThan(rendered.indexOf('"approach": "might"'))
  })

  it('leaves unknown placeholders intact so typos are visible', () => {
    expect(buildPrompt(oneTrial('success'), '{{nope}}')).toBe('{{nope}}')
  })

  it('loads the default template from the prompt file', () => {
    expect(loadChronicleTemplate()).toMatch(/Chronicler/)
  })

  it('feeds the built prompt to the llm and trims the completion', async () => {
    let seen = ''
    const llm = (prompt: string): Promise<string> => {
      seen = prompt
      return Promise.resolve('  the tale  ')
    }
    expect(await chronicle(oneTrial('success'), llm)).toBe('the tale')
    expect(seen).toContain('"outcome": "success"')
  })
})
