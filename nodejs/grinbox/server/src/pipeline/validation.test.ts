import type { Contract } from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { type OperatorForValidation, validateContractGraph, validatePipeline } from './validation.js'

/**
 * S3 spec. {@link validatePipeline} is a pure function over the post-change
 * enabled set: it derives Contracts for all five declared types via shared's
 * declarative registry, then runs the graph checks.
 *
 * Built-in Contracts now declare config-driven inputs: a Rule-based Tagger's
 * `tag.<key>` Rule refs and an Action's `when.tag_key` gate. So a dangling input
 * (and the producer→consumer ordering) IS expressible through real config —
 * exercised in the config-driven suite below. The synthetic-Contract graph
 * tests against {@link validateContractGraph} still pin the graph checks (cycle,
 * collision) directly, independent of any one type's derivation.
 */

function tagger(
  operatorId: number,
  outputKey: string,
  values: [string, ...string[]] = ['yes', 'no'],
): OperatorForValidation {
  return {
    operator_id: operatorId,
    type_key: 'rule_based_tagger',
    config_json: JSON.stringify({
      output_tag_key: outputKey,
      output_value_enum: values,
      rules: [],
      fallback: { output: values[0] },
    }),
  }
}

function contract(inputs: string[], outputKeys: string[]): Contract {
  return {
    inputs,
    outputs: outputKeys.map((key) => ({ key, valueEnum: ['a', 'b'] })),
    resources: [],
  }
}

describe('validatePipeline (config-driven)', () => {
  it('accepts a valid single-Tagger Pipeline', () => {
    const result = validatePipeline([tagger(1, 'urgency')])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contracts.get(1)?.outputs[0]?.key).toBe('urgency')
    }
  })

  it('accepts multiple Operators with distinct output keys', () => {
    const result = validatePipeline([tagger(1, 'urgency'), tagger(2, 'topic')])
    expect(result.ok).toBe(true)
  })

  it('rejects an output Tag-key collision (single-producer)', () => {
    const result = validatePipeline([tagger(1, 'urgency'), tagger(2, 'urgency')])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const collision = result.errors.find((e) => e.kind === 'output_key_collision')
      expect(collision).toBeDefined()
      if (collision?.kind === 'output_key_collision') {
        expect(collision.key).toBe('urgency')
        expect(collision.operatorIds).toEqual([1, 2])
      }
    }
  })

  it('rejects an unknown type_key', () => {
    const result = validatePipeline([{ operator_id: 1, type_key: 'no_such_type', config_json: '{}' }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe('unknown_type')
    }
  })

  it('rejects invalid config_json for a known type', () => {
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'rule_based_tagger',
        config_json: JSON.stringify({ output_tag_key: 'x' }),
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe('invalid_config')
    }
  })

  it('rejects non-JSON config as invalid_config', () => {
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'rule_based_tagger',
        config_json: 'not json',
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe('invalid_config')
    }
  })

  it('accepts an empty Pipeline', () => {
    expect(validatePipeline([]).ok).toBe(true)
  })

  it('rejects a notify gating on a Tag no Operator produces (dangling gate)', () => {
    // The real symptom-source: a notify gates on `urgency`, but no enabled
    // Operator produces it. Save-time validation must fail with dangling_input
    // rather than letting it cascade-skip silently at run time.
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'hi',
          credentials_id: 5,
          when: { tag_key: 'urgency', equals: ['high'] },
        }),
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const dangling = result.errors.find((e) => e.kind === 'dangling_input')
      expect(dangling).toBeDefined()
      if (dangling?.kind === 'dangling_input') {
        expect(dangling.inputKey).toBe('urgency')
        expect(dangling.operatorId).toBe(1)
      }
    }
  })

  it('accepts the real shape: an llm_tagger producing the Tags three notifies gate on', () => {
    // The no-false-positive case: the producer exists, so the gated Actions
    // must save AND now order after the tagger. This is the exact production
    // pipeline shape the fix must not regress.
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'm',
          prompt_template: 'p',
          outputs: [
            { tag_key: 'kind', value_enum: ['alert', 'fyi'] },
            { tag_key: 'source_type', value_enum: ['billing', 'social'] },
            { tag_key: 'domain', value_enum: ['work', 'home'] },
          ],
        }),
      },
      {
        operator_id: 2,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'hi',
          credentials_id: 5,
          when: { tag_key: 'kind', equals: ['alert'] },
        }),
      },
      {
        operator_id: 3,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'hi',
          credentials_id: 5,
          when: { tag_key: 'source_type', equals: ['billing'] },
        }),
      },
      {
        operator_id: 4,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'hi',
          credentials_id: 5,
          when: { tag_key: 'domain', equals: ['work'] },
        }),
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The fix populates inputs, so each notify's gate is now a declared edge.
      expect(result.contracts.get(2)?.inputs).toEqual(['kind'])
      expect(result.contracts.get(3)?.inputs).toEqual(['source_type'])
      expect(result.contracts.get(4)?.inputs).toEqual(['domain'])
    }
  })

  it('accepts the real shape: a notify whose message_template reads only Message fields derives no template inputs', () => {
    // The live notify ops interpolate Message fields (`{{from}}`/`{{subject}}`),
    // not Tags, in their templates. Those must NOT be mistaken for Tag refs:
    // the only declared input is the `when` gate's Tag, so a producer of that
    // Tag is the sole dependency and the pipeline saves cleanly.
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'm',
          prompt_template: 'p',
          outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
        }),
      },
      {
        operator_id: 2,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: '{{from}}: {{subject}}',
          credentials_id: 5,
          when: { tag_key: 'urgency', equals: ['high'] },
        }),
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Only the gate contributes; the Message-field template adds nothing.
      expect(result.contracts.get(2)?.inputs).toEqual(['urgency'])
    }
  })

  it('rejects a notify whose message_template reads a Tag no Operator produces (dangling template ref)', () => {
    // A `{{tag.<key>}}` template ref is a real dependency, so a template that
    // reads a Tag with no producer must fail at save — the same dangling-input
    // guard that covers gates and Rule refs.
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'Priority {{tag.urgency}}',
          credentials_id: 5,
        }),
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const dangling = result.errors.find((e) => e.kind === 'dangling_input')
      expect(dangling).toBeDefined()
      if (dangling?.kind === 'dangling_input') {
        expect(dangling.inputKey).toBe('urgency')
        expect(dangling.operatorId).toBe(1)
      }
    }
  })

  it('accepts a rule_based_tagger whose Rules reference a Tag another Operator produces', () => {
    // llm_tagger produces `kind`; a Rule-based Tagger's Rule reads `tag.kind`.
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'm',
          prompt_template: 'p',
          outputs: [{ tag_key: 'kind', value_enum: ['alert', 'fyi'] }],
        }),
      },
      {
        operator_id: 2,
        type_key: 'rule_based_tagger',
        config_json: JSON.stringify({
          output_tag_key: 'route',
          output_value_enum: ['a', 'b'],
          rules: [{ match: 'tag.kind == "alert"', output: 'a' }],
          fallback: { output: 'b' },
        }),
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contracts.get(2)?.inputs).toEqual(['kind'])
    }
  })

  it('rejects a rule_based_tagger whose Rule references a Tag no Operator produces', () => {
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'rule_based_tagger',
        config_json: JSON.stringify({
          output_tag_key: 'route',
          output_value_enum: ['a', 'b'],
          rules: [{ match: 'tag.kind == "alert"', output: 'a' }],
          fallback: { output: 'b' },
        }),
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const dangling = result.errors.find((e) => e.kind === 'dangling_input')
      expect(dangling?.kind === 'dangling_input' && dangling.inputKey).toBe('kind')
    }
  })

  it('validates all five declared types (incl. not-yet-runnable ones)', () => {
    const result = validatePipeline([
      tagger(1, 'urgency'),
      {
        operator_id: 2,
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'm',
          prompt_template: 'p',
          outputs: [{ tag_key: 'topic', value_enum: ['a', 'b'] }],
        }),
      },
      {
        operator_id: 3,
        type_key: 'notify',
        config_json: JSON.stringify({
          message_template: 'hi',
          credentials_id: 5,
        }),
      },
      {
        operator_id: 4,
        type_key: 'apply_category',
        config_json: JSON.stringify({ category_template: 'Bills' }),
      },
      {
        operator_id: 5,
        type_key: 'digest_delivery',
        config_json: JSON.stringify({
          schedule: '0 8 * * *',
          model_id: 'm',
          prompt_template: 'p',
        }),
      },
    ])
    expect(result.ok).toBe(true)
  })
})

describe('validateContractGraph (graph-level checks)', () => {
  it('accepts an acyclic producer→consumer chain', () => {
    // 1 produces 'a'; 2 consumes 'a' and produces 'b'; 3 consumes 'b'.
    const errors = validateContractGraph(
      new Map([
        [1, contract([], ['a'])],
        [2, contract(['a'], ['b'])],
        [3, contract(['b'], [])],
      ]),
    )
    expect(errors).toEqual([])
  })

  it('rejects a dangling input', () => {
    const errors = validateContractGraph(new Map([[1, contract(['missing'], ['a'])]]))
    const dangling = errors.find((e) => e.kind === 'dangling_input')
    expect(dangling).toBeDefined()
    if (dangling?.kind === 'dangling_input') {
      expect(dangling.inputKey).toBe('missing')
      expect(dangling.operatorId).toBe(1)
    }
  })

  it('rejects a cycle and reports the cycle', () => {
    // 1 produces 'a' & consumes 'b'; 2 produces 'b' & consumes 'a' → cycle.
    const errors = validateContractGraph(
      new Map([
        [1, contract(['b'], ['a'])],
        [2, contract(['a'], ['b'])],
      ]),
    )
    const cycle = errors.find((e) => e.kind === 'cycle')
    expect(cycle).toBeDefined()
    if (cycle?.kind === 'cycle') {
      // The reported cycle closes back on its first node.
      expect(cycle.cycle.length).toBeGreaterThanOrEqual(3)
      expect(cycle.cycle[0]).toBe(cycle.cycle[cycle.cycle.length - 1])
      expect(new Set(cycle.cycle)).toEqual(new Set([1, 2]))
    }
  })

  it('reports collision instead of cycle when output keys collide', () => {
    const errors = validateContractGraph(
      new Map([
        [1, contract([], ['dup'])],
        [2, contract([], ['dup'])],
      ]),
    )
    expect(errors.some((e) => e.kind === 'output_key_collision')).toBe(true)
    expect(errors.some((e) => e.kind === 'cycle')).toBe(false)
  })
})
