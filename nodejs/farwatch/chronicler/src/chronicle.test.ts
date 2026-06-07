import { describe, it, expect } from 'vitest'

import type { Outcome } from '@thrashplay/fw-simulation'
import { makeAdventure, makeTrial } from '@thrashplay/fw-simulation/testing'

import {
  buildPrompt,
  buildChroniclePrompt,
  buildSingleTrialPrompt,
  buildSummaryPrompt,
  chronicle,
  chronicleByTrial,
  chronicleZoomed,
  listPromptOptions,
  loadExamples,
} from './chronicle.js'

/** A degenerate one-trial adventure with the given overall outcome. */
const oneTrial = (outcome: Outcome) => makeAdventure({ trials: [makeTrial({ approach: 'combat', outcome })], outcome })

/** A spec that fills every placeholder of the real `chronicle` template (examples is now data). */
const fullSpec = (adventure = '{}') => ({
  template: 'chronicle',
  snippets: { register: 'saga', writing_style: 'plain', invention: 'tight' },
  data: { adventure, examples: 'THE-EXAMPLES' },
})

describe('buildPrompt (composition)', () => {
  it('fills snippet placeholders from snippets/<placeholder>/<name>.md and data placeholders verbatim', () => {
    const prompt = buildPrompt(fullSpec('THE-ADVENTURE-JSON'))
    expect(prompt).toContain('Chronicler') // template skeleton
    expect(prompt).toContain('old sagas') // register/saga.md
    expect(prompt).toContain('Resist ornament') // writing-style/plain.md
    expect(prompt).toContain('three to five sentences') // invention/tight.md
    expect(prompt).toContain('THE-ADVENTURE-JSON') // adventure data, verbatim
    expect(prompt).toContain('THE-EXAMPLES') // examples data, verbatim
  })

  it('maps placeholder names to directories by convention (_ → -)', () => {
    // `{{writing_style}}` must resolve from `snippets/writing-style/`, not `snippets/writing_style/`.
    expect(buildPrompt(fullSpec())).toContain('Resist ornament')
  })

  it('throws when a template placeholder is left unfilled', () => {
    expect(() => buildPrompt({ template: 'chronicle', snippets: { writing_style: 'plain' } })).toThrowError(
      /unfilled placeholder.*register.*invention.*examples.*adventure/s,
    )
  })

  it('throws when a fill has no matching placeholder (typo guard)', () => {
    expect(() => buildPrompt({ ...fullSpec(), snippets: { ...fullSpec().snippets, bogus: 'x' } })).toThrowError(
      /no matching placeholder.*bogus/s,
    )
  })

  it('throws when a named snippet file does not exist', () => {
    expect(() =>
      buildPrompt({ ...fullSpec(), snippets: { ...fullSpec().snippets, writing_style: 'nope' } }),
    ).toThrowError(/no snippet "nope".*writing-style\/nope\.md/s)
  })

  it('throws when a placeholder is supplied by both channels', () => {
    expect(() =>
      buildPrompt({ template: 'chronicle', snippets: { adventure: 'x' }, data: { adventure: 'y' } }),
    ).toThrowError(/both snippet and data.*adventure/s)
  })
})

describe('listPromptOptions', () => {
  it('discovers templates and one axis per snippet directory (excluding templates)', () => {
    const { templates, axes } = listPromptOptions()
    expect(templates).toContain('chronicle')
    const byPlaceholder = Object.fromEntries(axes.map((a) => [a.placeholder, a.options]))
    expect(byPlaceholder).not.toHaveProperty('templates')
    // `examples/` is a data store keyed by the selection, not a pickable axis.
    expect(byPlaceholder).not.toHaveProperty('examples')
    expect(byPlaceholder.register).toEqual(expect.arrayContaining(['legendary', 'saga', 'annalist']))
    // The directory `writing-style/` surfaces under the placeholder name `writing_style`.
    expect(byPlaceholder.writing_style).toEqual(expect.arrayContaining(['mythic', 'plain']))
  })

  it('reports, per template, which axes and data placeholders it uses and whether it takes examples', () => {
    const { templateUses } = listPromptOptions()
    // chronicle: all three voice axes, plus the {{adventure}} + {{examples}} data slots.
    expect(templateUses.chronicle).toEqual({
      axes: ['invention', 'register', 'writing_style'],
      data: ['adventure', 'examples'],
      examples: true,
    })
    // summary: only register + writing_style (invention would fight distillation), no examples.
    expect(templateUses.summary).toMatchObject({ axes: ['register', 'writing_style'], examples: false })
    // treatment is adventure-level (only standard data) → standalone-runnable via the skeleton; its
    // one snippet axis (`grounding`) lets the palette discipline be A/B-tested.
    expect(templateUses.treatment).toMatchObject({
      axes: ['grounding'],
      data: ['aims', 'outcome', 'palette', 'party', 'trials'],
    })
  })
})

describe('buildChroniclePrompt', () => {
  it('fills {{adventure}} with the chronicle-legal view: approach + outcome, no dice', () => {
    const rendered = buildChroniclePrompt(oneTrial('failure'))
    expect(rendered).toContain('"approach": "combat"')
    expect(rendered).toContain('"outcome": "failure"')
    // The resolver's mechanics never reach the model.
    expect(rendered).not.toContain('0.987654')
    expect(rendered).not.toContain('"target"')
  })

  it('keeps trials in order', () => {
    const adv = makeAdventure({
      trials: [
        makeTrial({ approach: 'stealth', outcome: 'success' }),
        makeTrial({ approach: 'might', outcome: 'failure' }),
      ],
      outcome: 'failure',
    })
    const rendered = buildChroniclePrompt(adv)
    expect(rendered.indexOf('"approach": "stealth"')).toBeLessThan(rendered.indexOf('"approach": "might"'))
  })

  it('overrides a single snippet without disturbing the rest', () => {
    const plain = buildChroniclePrompt(oneTrial('success'), { snippets: { writing_style: 'plain' } })
    expect(plain).toContain('Resist ornament') // writing_style overridden
    expect(plain).toContain('as legend') // register/legendary.md still the default
  })

  it('loads the default combo’s few-shot examples (pre-seeded on disk)', () => {
    // Default = invention=descriptive · register=legendary · writing_style=mythic, which is seeded.
    const rendered = buildChroniclePrompt(oneTrial('success'))
    expect(rendered).toContain('## Examples')
    expect(rendered).toContain('<example>')
    expect(rendered).toContain('first warden')
  })

  it('exampleCount caps how many examples are included; 0 is zero-shot', () => {
    expect(buildChroniclePrompt(oneTrial('success'), { exampleCount: 0 })).not.toContain('<example>')
    const one = buildChroniclePrompt(oneTrial('success'), { exampleCount: 1 })
    expect(one.match(/<example>/g)).toHaveLength(1)
  })
})

describe('loadExamples', () => {
  const DEFAULT = { register: 'legendary', writing_style: 'mythic', invention: 'descriptive' }

  it('loads up to count blocks for a generated combo, under an Examples heading', () => {
    expect(loadExamples(DEFAULT, 0)).toBe('')
    expect(loadExamples(DEFAULT, 2)).toMatch(/^## Examples/)
    expect(loadExamples(DEFAULT, 2).match(/<example>/g)).toHaveLength(2)
  })

  it('falls back to no examples when the combo has no file (newly added / not yet generated)', () => {
    // A selection whose key has no `<key>.md` yet → zero-shot, not an error.
    expect(loadExamples({ ...DEFAULT, invention: 'ungenerated' }, 3)).toBe('')
  })
})

describe('buildSingleTrialPrompt', () => {
  const adv = makeAdventure({
    trials: [
      makeTrial({ approach: 'stealth', outcome: 'success' }),
      makeTrial({ approach: 'might', outcome: 'failure' }),
    ],
    outcome: 'failure',
  })

  it('uses the single-trial template and fills the aim, the story so far, and one trial', () => {
    const prompt = buildSingleTrialPrompt(adv, 1, 'THE-STORY-SO-FAR')
    expect(prompt).toContain('one beat at a time') // single-trial template skeleton
    expect(prompt).toContain('as legend') // register/legendary.md (default voice)
    expect(prompt).toContain('THE-STORY-SO-FAR') // adventure_so_far data, verbatim
    expect(prompt).toContain('"approach": "might"') // the trial at index 1
    expect(prompt).not.toContain('"approach": "stealth"') // not the other trials
    expect(prompt).toContain('"goal"') // aims block carries the goal
  })

  it('marks the first beat when there is no story yet', () => {
    expect(buildSingleTrialPrompt(adv, 0, '')).toContain('this is the first beat')
  })

  it('throws for a trial index out of range', () => {
    expect(() => buildSingleTrialPrompt(adv, 2, '')).toThrowError(/no trial at index 2.*has 2/s)
  })
})

describe('chronicleByTrial', () => {
  it('narrates one beat per trial, feeding each narrative into the next as the story so far', async () => {
    const adv = makeAdventure({
      trials: [makeTrial({ approach: 'stealth' }), makeTrial({ approach: 'lore' }), makeTrial({ approach: 'might' })],
    })
    const prompts: string[] = []
    let n = 0
    const llm = (prompt: string): Promise<string> => {
      prompts.push(prompt)
      n += 1
      return Promise.resolve(`  beat-${String(n)}  `)
    }
    const beats = await chronicleByTrial(adv, llm)
    expect(beats.map((b) => b.narrative)).toEqual(['beat-1', 'beat-2', 'beat-3']) // trimmed, in order
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2])
    // The second and third prompts carry the prior beats as "the story so far".
    expect(prompts[1]).toContain('beat-1')
    expect(prompts[2]).toContain('beat-1')
    expect(prompts[2]).toContain('beat-2')
  })
})

describe('buildSummaryPrompt', () => {
  const adv = makeAdventure({ trials: [makeTrial({ approach: 'stealth' })] })

  it('uses the summary template with the draft and aim, in the chosen voice', () => {
    const prompt = buildSummaryPrompt(adv, 'THE-DRAFT-PROSE', {
      snippets: { register: 'saga', writing_style: 'plain', invention: 'tight' },
    })
    expect(prompt).toContain('finished chronicle') // summary template skeleton
    expect(prompt).toContain('THE-DRAFT-PROSE') // full_chronicle data, verbatim
    expect(prompt).toContain('old sagas') // register/saga.md
    expect(prompt).toContain('Resist ornament') // writing-style/plain.md
    // invention is ignored for summaries (no slot) — its content must not leak in, and it must not throw.
    expect(prompt).not.toContain('three to five sentences')
  })
})

describe('chronicleZoomed', () => {
  it('narrates beat by beat, then distils the beats into a summary', async () => {
    const adv = makeAdventure({ trials: [makeTrial({ approach: 'stealth' }), makeTrial({ approach: 'might' })] })
    let beat = 0
    const llm = (prompt: string): Promise<string> => {
      // The summary call is the one whose prompt carries the assembled draft.
      if (prompt.includes('The draft to distil')) {
        return Promise.resolve('  THE-SUMMARY  ')
      }
      beat += 1
      return Promise.resolve(`beat-${String(beat)}`)
    }
    const { beats, summaryPrompt, summary } = await chronicleZoomed(adv, llm)
    expect(beats.map((b) => b.narrative)).toEqual(['beat-1', 'beat-2'])
    expect(summary).toBe('THE-SUMMARY') // trimmed
    // The summary's draft is the beats joined.
    expect(summaryPrompt).toContain('beat-1')
    expect(summaryPrompt).toContain('beat-2')
  })
})

describe('chronicle', () => {
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
