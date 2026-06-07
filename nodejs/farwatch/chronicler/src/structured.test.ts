import { describe, it, expect } from 'vitest'

import { loadTemplate } from './chronicle.js'
import { runPipeline, type Pipeline } from './pipeline.js'
import { loadSchema, requestStructured } from './structured.js'

const VALID = '{"entities":[{"name":"Maelis","kind":"person","look":"a grey-cloaked warden"}]}'

describe('loadTemplate', () => {
  it('returns a prose body and no schema for a plain template', () => {
    const t = loadTemplate('single-trial')
    expect(t.out).toBeUndefined()
    expect(t.body).toContain('Chronicler')
  })

  it('reads the output schema from frontmatter and strips it from the body', () => {
    const t = loadTemplate('cast-sketch')
    expect(t.out).toBe('cast')
    expect(t.body.startsWith('---')).toBe(false) // frontmatter fence removed
    expect(t.body).toContain('loremaster')
  })
})

describe('loadSchema', () => {
  it('loads a JSON Schema file by name', () => {
    expect(loadSchema('cast')).toMatchObject({ type: 'object' })
  })
})

describe('requestStructured', () => {
  it('returns parsed, validated JSON', async () => {
    const out = await requestStructured(() => Promise.resolve(VALID), 'prompt', 'cast')
    expect(out).toEqual({ entities: [{ name: 'Maelis', kind: 'person', look: 'a grey-cloaked warden' }] })
  })

  it('extracts the JSON from a fenced / prose-wrapped reply', async () => {
    const fenced = 'Sure, here you go:\n```json\n' + VALID + '\n```\n'
    expect(await requestStructured(() => Promise.resolve(fenced), 'p', 'cast')).toMatchObject({
      entities: [{ name: 'Maelis' }],
    })
  })

  it('re-prompts on invalid output, then succeeds', async () => {
    let calls = 0
    const llm = (): Promise<string> => {
      calls += 1
      return Promise.resolve(calls === 1 ? '{"entities":"not a list"}' : VALID)
    }
    const out = await requestStructured(llm, 'p', 'cast')
    expect(calls).toBe(2)
    expect(out).toMatchObject({ entities: [{ kind: 'person' }] })
  })

  it('throws after exhausting retries', async () => {
    await expect(
      requestStructured(() => Promise.resolve('not json at all'), 'p', 'cast', undefined, 1),
    ).rejects.toThrow(/failed after 2 attempts/)
  })
})

describe('executor: structured call', () => {
  it('a call to a template with an out: schema yields validated JSON, not { text }', async () => {
    const p: Pipeline = {
      name: 't',
      in: ['adventure'],
      out: { cast: 'cast' },
      steps: [
        {
          as: 'cast',
          call: 'cast-sketch',
          bind: { aims: 'adventure', party: 'adventure', scenes_so_far: 'adventure', trial: 'adventure' },
        },
      ],
    }
    const { out } = await runPipeline(p, { adventure: {} }, () => Promise.resolve(VALID))
    expect(out.cast).toEqual({ entities: [{ name: 'Maelis', kind: 'person', look: 'a grey-cloaked warden' }] })
  })
})
