import { describe, it, expect } from 'vitest'

import { loadPipeline, listPipelines, renderValue, runPipeline, type Pipeline } from './pipeline.js'

describe('renderValue (dual render rules)', () => {
  it('passes strings through, unwraps {text}, joins arrays of {text}, JSONs the rest', () => {
    expect(renderValue('hello')).toBe('hello')
    expect(renderValue({ text: 'one' })).toBe('one')
    expect(renderValue([{ text: 'a' }, { text: 'b' }])).toBe('a\n\nb')
    expect(renderValue([])).toBe('') // a degenerate array-of-text → empty (first-beat "so far")
    expect(renderValue({ goal: 'x' })).toBe('{\n  "goal": "x"\n}') // structured → pretty JSON
  })
})

describe('runPipeline', () => {
  it('derive `pick` projects fields, and `out` returns the named path', async () => {
    const p: Pipeline = {
      name: 't',
      in: ['adventure'],
      out: { aims: 'aims' },
      steps: [{ as: 'aims', derive: 'pick', from: 'adventure', fields: ['goal', 'optionalGoals'] }],
    }
    const { out } = await runPipeline(p, { adventure: { goal: 'G', optionalGoals: [], party: ['x'] } }, () =>
      Promise.resolve(''),
    )
    expect(out.aims).toEqual({ goal: 'G', optionalGoals: [] }) // `party` dropped
  })

  it('map runs the body per item, threading `prior` and collecting outputs per name', async () => {
    // No LLM needed: the body uses derives. `seen` captures prior `picked` each iteration.
    const p: Pipeline = {
      name: 't',
      in: ['items'],
      out: { picked: 'm.picked', seen: 'm.seen' },
      steps: [
        {
          as: 'm',
          map: 'items',
          item: 'it',
          body: [
            { as: 'seen', derive: 'pick', from: 'prior', fields: ['picked'] },
            { as: 'picked', derive: 'pick', from: 'it', fields: ['v'] },
          ],
        },
      ],
    }
    const { out } = await runPipeline(p, { items: [{ v: 'a' }, { v: 'b' }] }, () => Promise.resolve(''))
    expect(out.picked).toEqual([{ v: 'a' }, { v: 'b' }]) // collected in order
    // `prior.picked` grows by one each iteration: [] then [{v:'a'}].
    expect(out.seen).toEqual([{ picked: [] }, { picked: [{ v: 'a' }] }])
  })

  it('a call renders its bindings into the template, applies snippet config, and wraps output as {text}', async () => {
    const seen: string[] = []
    const llm = (prompt: string): Promise<string> => {
      seen.push(prompt)
      return Promise.resolve('  THE SUMMARY  ')
    }
    const p: Pipeline = {
      name: 't',
      in: ['aims', 'draft'],
      out: { chronicle: 'c' },
      config: { summary: { register: 'legendary', writing_style: 'mythic' } },
      steps: [{ as: 'c', call: 'summary', bind: { aims: 'aims', full_chronicle: 'draft' } }],
    }
    const { out, trace } = await runPipeline(
      p,
      {
        aims: { goal: { reward: { kind: 'item' }, viable: true }, optionalGoals: [] },
        draft: [{ text: 's1' }, { text: 's2' }],
      },
      llm,
    )
    expect(out.chronicle).toEqual({ text: 'THE SUMMARY' }) // trimmed, wrapped
    expect(seen[0]).toContain('s1\n\ns2') // array of {text} joined into the prompt
    expect(seen[0]).toContain('as legend') // register=legendary snippet applied
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({ as: 'c', kind: 'call', template: 'summary' })
  })

  it('throws when a required input is missing', async () => {
    const p: Pipeline = { name: 't', in: ['adventure'], steps: [] }
    await expect(runPipeline(p, {}, () => Promise.resolve(''))).rejects.toThrow(/missing input "adventure"/)
  })
})

describe('loadPipeline', () => {
  it('lists and loads the authored zoomed pipeline', () => {
    expect(listPipelines()).toContain('zoomed')
    const p = loadPipeline('zoomed')
    expect(p.name).toBe('zoomed')
    expect(p.in).toEqual(['adventure'])
    expect(p.steps.length).toBeGreaterThan(0)
  })
})
