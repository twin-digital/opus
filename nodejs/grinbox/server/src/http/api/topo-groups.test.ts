import { type Contract, contractFromConfig } from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { type GraphNode, topoGroups } from './pipelines.js'

/**
 * Build a synthetic Operator Contract that *declares inputs* — the case the MVP
 * built-ins never reach (they declare no inputs, so the live route only ever
 * lands every Operator in group 0). These hand-built contracts drive the
 * multi-level levelization, the producer map, and the cycle fallback.
 */
function contract(inputs: string[], outputs: string[]): Contract {
  return {
    inputs,
    outputs: outputs.map((key) => ({ key, valueEnum: ['yes', 'no'] })),
    resources: [],
  }
}

function node(id: number, inputs: string[], outputs: string[], enabled = true): GraphNode {
  return { id, enabled, contract: contract(inputs, outputs) }
}

describe('topoGroups', () => {
  it('levelizes a real producer→consumer chain A→B→C into groups [0],[1],[2]', () => {
    // A produces tag "a"; B consumes "a" and produces "b"; C consumes "b".
    const a = node(1, [], ['a'])
    const b = node(2, ['a'], ['b'])
    const c = node(3, ['b'], [])
    const groups = topoGroups([a, b, c])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(1)
    expect(groups.get(3)).toBe(2)
  })

  it('places mutually-independent siblings in the same group', () => {
    // A produces "a"; B and C both consume "a" but neither depends on the other.
    const a = node(1, [], ['a'])
    const b = node(2, ['a'], ['b'])
    const c = node(3, ['a'], ['c'])
    const groups = topoGroups([a, b, c])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(1)
    expect(groups.get(3)).toBe(1)
  })

  it("takes a consumer's level from its longest dependency chain", () => {
    // A→B→D and A→D: D depends on both A (level 0) and B (level 1), so D is at
    // level 2 (the longest chain), not level 1.
    const a = node(1, [], ['a'])
    const b = node(2, ['a'], ['b'])
    const d = node(3, ['a', 'b'], [])
    const groups = topoGroups([a, b, d])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(1)
    expect(groups.get(3)).toBe(2)
  })

  it('ignores edges to disabled producers (disabled nodes declare no usable edges)', () => {
    // A is disabled, so its output "a" has no enabled producer; B's input is
    // unsatisfied and B falls to level 0.
    const a = node(1, [], ['a'], false)
    const b = node(2, ['a'], [])
    const groups = topoGroups([a, b])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(0)
  })

  it('falls back to level 0 for nodes left in a cycle', () => {
    // A consumes "b" (produced by B) and produces "a"; B consumes "a" and
    // produces "b" — a 2-node cycle. Neither can be levelled; both fall back.
    const a = node(1, ['b'], ['a'])
    const b = node(2, ['a'], ['b'])
    const groups = topoGroups([a, b])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(0)
  })

  it('levels a notify below the tagger that produces its gating Tag (real derivation)', () => {
    // Drive levelization through the PRODUCTION `contractFromConfig`: a tagger
    // declares output `urgency`; a notify gates on `when.tag_key=urgency`. The
    // edge now forms from the derived `inputs`, so the notify is NOT at group 0.
    const taggerContract: Contract = contractFromConfig('llm_tagger', {
      model_id: 'm',
      prompt_template: 'p',
      outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
    })
    const notifyContract: Contract = contractFromConfig('notify', {
      message_template: 'hi',
      credentials_id: 1,
      when: { tag_key: 'urgency', equals: ['high'] },
    })
    const groups = topoGroups([
      { id: 1, enabled: true, contract: taggerContract },
      { id: 2, enabled: true, contract: notifyContract },
    ])
    expect(groups.get(1)).toBe(0)
    expect(groups.get(2)).toBe(1)
  })
})
