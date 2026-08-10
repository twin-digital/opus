import type { Contract } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'
import {
  type OperatorForValidation,
  saveTimeValidationErrors,
  validateContractGraph,
  validatePipeline,
} from './validation.js'

/**
 * S3 spec. {@link validatePipeline} is a pure function over the post-change
 * enabled set: it derives Contracts for every declared type via shared's
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
          model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
          model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
          model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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

  it('validates every declared type together in one Pipeline', () => {
    const result = validatePipeline([
      tagger(1, 'urgency'),
      {
        operator_id: 2,
        type_key: 'llm_tagger',
        config_json: JSON.stringify({
          model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
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
      // The digest's `digest_category` input needs a producer in the set.
      tagger(5, 'digest_category', ['none', 'bill']),
      {
        operator_id: 6,
        type_key: 'digest_delivery',
        config_json: JSON.stringify({
          schedule: '0 8 * * *',
          sections: [
            {
              category: 'bill',
              title: 'Bills',
              render: 'list',
              item_template: '{{subject}}',
            },
          ],
          summary_model_id: null,
        }),
      },
    ])
    expect(result.ok).toBe(true)
  })

  it('rejects a digest edition whose digest_category input has no producer', () => {
    const result = validatePipeline([
      {
        operator_id: 1,
        type_key: 'digest_delivery',
        config_json: JSON.stringify({
          schedule: '0 8 * * *',
          sections: [{ category: 'bill', title: 'Bills', render: 'count' }],
          summary_model_id: null,
        }),
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({
        kind: 'dangling_input',
        inputKey: 'digest_category',
      })
    }
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

  // The self-dependency the fold names first among the configurations that could
  // not run (r-qu9y7wgg), refused at save like any other cycle (d-8y8i45y2).
  // findCycle drops the self-edge, so this operator saves and then never becomes
  // ready: its own output is the input it waits on.
  it('rejects an operator that depends on its own output', () => {
    const errors = validateContractGraph(new Map([[1, contract(['a'], ['a'])]]))
    const cycle = errors.find((e) => e.kind === 'cycle')
    expect(cycle).toBeDefined()
    if (cycle?.kind === 'cycle') {
      expect(cycle.cycle).toContain(1)
    }
  })

  it('rejects a self-dependency reached through the gate', () => {
    // The same shape with a sibling present: the graph is otherwise runnable, so
    // nothing else fails the save and the self-edge is the only fault.
    const errors = validateContractGraph(
      new Map([
        [1, contract([], ['a'])],
        [2, contract(['a', 'b'], ['b'])],
      ]),
    )
    expect(errors.some((e) => e.kind === 'cycle')).toBe(true)
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

/**
 * `saveTimeValidationErrors` is the save-time-only gate: placeholder names the
 * renderer would silently swallow to `""`. It is deliberately NOT part of
 * `validatePipeline` (which also gates Triage enqueue) — a stored config with
 * a stray placeholder keeps triaging as before; only create/edit reject it.
 */
describe('saveTimeValidationErrors', () => {
  /** Template checks need no siblings; the target itself is the post-state. */
  const check = (op: OperatorForValidation): ReturnType<typeof saveTimeValidationErrors> =>
    saveTimeValidationErrors(op, [op])

  function llm(operatorId: number, promptTemplate: string): OperatorForValidation {
    return {
      operator_id: operatorId,
      type_key: 'llm_tagger',
      config_json: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: promptTemplate,
        outputs: [{ tag_key: 'kind', value_enum: ['a', 'b'] }],
      }),
    }
  }

  it('accepts renderer-known fields and tag refs', () => {
    expect(check(llm(1, '{{from}} {{to}} {{subject}} {{snippet}} {{body}} {{tag.kind}}'))).toEqual([])
  })

  it('rejects a case-mismatched field with a named placeholder', () => {
    const errors = check(llm(1, 'classify {{Body}}'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      kind: 'unknown_placeholder',
      operatorId: 1,
      placeholder: 'Body',
    })
    expect(errors[0]?.message).toContain("'{{Body}}'")
  })

  it('rejects unknown names in notify and apply_category templates', () => {
    const notify: OperatorForValidation = {
      operator_id: 2,
      type_key: 'notify',
      config_json: JSON.stringify({
        message_template: 'msg: {{message}}',
        credentials_id: 1,
      }),
    }
    const applyCategory: OperatorForValidation = {
      operator_id: 3,
      type_key: 'apply_category',
      config_json: JSON.stringify({ category_template: '{{Category}}' }),
    }
    expect(check(notify)).toMatchObject([{ kind: 'unknown_placeholder', placeholder: 'message' }])
    expect(check(applyCategory)).toMatchObject([{ kind: 'unknown_placeholder', placeholder: 'Category' }])
  })

  it('reports each unknown name once', () => {
    const errors = check(llm(1, '{{a}} {{b}} {{a}}'))
    expect(errors.map((e) => (e.kind === 'unknown_placeholder' ? e.placeholder : ''))).toEqual(['a', 'b'])
  })

  it('yields nothing for an unknown type or invalid config (validatePipeline reports those)', () => {
    expect(
      check({
        operator_id: 1,
        type_key: 'mystery',
        config_json: '{}',
      }),
    ).toEqual([])
    expect(
      check({
        operator_id: 1,
        type_key: 'llm_tagger',
        config_json: 'not json',
      }),
    ).toEqual([])
  })

  it('yields nothing for a template-free type (rule_based_tagger)', () => {
    expect(
      check({
        operator_id: 1,
        type_key: 'rule_based_tagger',
        config_json: JSON.stringify({
          output_tag_key: 'k',
          output_value_enum: ['yes', 'no'],
          rules: [],
          fallback: { output: 'no' },
        }),
      }),
    ).toEqual([])
  })

  it('checks digest section templates, per column', () => {
    const digest: OperatorForValidation = {
      operator_id: 2,
      type_key: 'digest_delivery',
      config_json: JSON.stringify({
        schedule: '0 7 * * *',
        sections: [
          {
            category: 'bill',
            title: 'Bills',
            render: 'list',
            item_template: '{{whatever}}',
          },
          {
            category: 'receipt',
            title: 'Receipts',
            render: 'table',
            columns: [
              { header: 'From', template: '{{from}}' },
              { header: 'Oops', template: '{{Amount}}' },
            ],
          },
        ],
        summary_model_id: null,
      }),
    }
    const errors = check(digest)
    expect(errors).toMatchObject([
      { kind: 'unknown_placeholder', placeholder: 'whatever' },
      { kind: 'unknown_placeholder', placeholder: 'Amount' },
    ])
    expect(errors[0]?.message).toContain('sections[0].item_template')
    expect(errors[1]?.message).toContain('sections[1].columns[1].template')
  })

  it("rejects the reserved 'name(...)' call form with a dedicated error", () => {
    const errors = check(llm(1, 'total: {{sum(tag.amount)}} of {{count()}}'))
    expect(errors).toMatchObject([
      { kind: 'reserved_placeholder', placeholder: 'sum(tag.amount)' },
      { kind: 'reserved_placeholder', placeholder: 'count()' },
    ])
    expect(errors[0]?.message).toContain('reserved for aggregation')
  })

  it('validatePipeline itself still accepts a stray placeholder (enqueue must not break)', () => {
    const result = validatePipeline([llm(1, 'classify {{Body}}')])
    expect(result.ok).toBe(true)
  })

  // --- `when` gate checks (producer must be enum; equals within enum) ------

  function extractor(operatorId: number): OperatorForValidation {
    return {
      operator_id: operatorId,
      type_key: 'llm_tagger',
      config_json: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: 'extract',
        outputs: [{ tag_key: 'amount', value_type: 'money' }],
      }),
    }
  }

  function gatedNotify(operatorId: number, when: { tag_key: string; equals: string[] }): OperatorForValidation {
    return {
      operator_id: operatorId,
      type_key: 'notify',
      config_json: JSON.stringify({
        message_template: 'hi',
        credentials_id: 1,
        when,
      }),
    }
  }

  it('accepts a when gate over an enum producer with member values', () => {
    const producer = tagger(1, 'urgency', ['high', 'low'])
    const gated = gatedNotify(2, { tag_key: 'urgency', equals: ['high'] })
    expect(saveTimeValidationErrors(gated, [producer, gated])).toEqual([])
  })

  it('rejects a when gate whose producer is an extracted output', () => {
    const producer = extractor(1)
    const gated = gatedNotify(2, { tag_key: 'amount', equals: ['19503:USD'] })
    const errors = saveTimeValidationErrors(gated, [producer, gated])
    expect(errors).toMatchObject([{ kind: 'invalid_when_gate', operatorId: 2, tagKey: 'amount' }])
    expect(errors[0]?.message).toContain('extracted')
  })

  it('rejects a when gate value outside the producer enum', () => {
    const producer = tagger(1, 'urgency', ['high', 'low'])
    const gated = gatedNotify(2, {
      tag_key: 'urgency',
      equals: ['high', 'urgent'],
    })
    const errors = saveTimeValidationErrors(gated, [producer, gated])
    expect(errors).toMatchObject([{ kind: 'invalid_when_gate', operatorId: 2, tagKey: 'urgency' }])
    expect(errors[0]?.message).toContain("'urgent'")
  })

  it('gated Taggers get the same gate checks as Actions', () => {
    const producer = tagger(1, 'digest_category', ['none', 'bill'])
    const gated: OperatorForValidation = {
      operator_id: 2,
      type_key: 'llm_tagger',
      config_json: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: 'extract',
        outputs: [{ tag_key: 'amount', value_type: 'money' }],
        when: { tag_key: 'digest_category', equals: ['receipt'] },
      }),
    }
    expect(saveTimeValidationErrors(gated, [producer, gated])).toMatchObject([
      { kind: 'invalid_when_gate', tagKey: 'digest_category' },
    ])
  })

  it('a gate whose tag_key has no producer is left to the dangling-input check', () => {
    const gated = gatedNotify(2, { tag_key: 'urgency', equals: ['high'] })
    expect(saveTimeValidationErrors(gated, [gated])).toEqual([])
  })

  // --- digest section checks ----------------------------------------------

  function digestEdition(
    operatorId: number,
    categories: string[],
    extra: Record<string, unknown> = {},
  ): OperatorForValidation {
    return {
      operator_id: operatorId,
      type_key: 'digest_delivery',
      config_json: JSON.stringify({
        schedule: '0 8 * * *',
        sections: categories.map((category) => ({
          category,
          title: category,
          render: 'count',
          ...extra,
        })),
        summary_model_id: null,
      }),
    }
  }

  it('accepts sections whose categories are members of the producer enum', () => {
    const producer = tagger(1, 'digest_category', ['none', 'bill', 'receipt'])
    const edition = digestEdition(2, ['bill', 'receipt'])
    expect(saveTimeValidationErrors(edition, [producer, edition])).toEqual([])
  })

  it('rejects a section category outside the producer enum', () => {
    const producer = tagger(1, 'digest_category', ['none', 'bill'])
    const edition = digestEdition(2, ['bill', 'deal'])
    const errors = saveTimeValidationErrors(edition, [producer, edition])
    expect(errors).toMatchObject([{ kind: 'invalid_digest_section', operatorId: 2, category: 'deal' }])
  })

  it('rejects overlapping category claims across editions', () => {
    const producer = tagger(1, 'digest_category', ['none', 'bill', 'receipt'])
    const daily = digestEdition(2, ['bill'])
    const weekly = digestEdition(3, ['bill', 'receipt'])
    const errors = saveTimeValidationErrors(weekly, [producer, daily, weekly])
    expect(errors).toMatchObject([{ kind: 'invalid_digest_section', operatorId: 3, category: 'bill' }])
    expect(errors[0]?.message).toContain('already claimed by digest edition 2')
  })

  it('rejects a highlight over a non-money/date tag', () => {
    const producer = tagger(1, 'digest_category', ['none', 'bill'])
    const payee: OperatorForValidation = {
      operator_id: 2,
      type_key: 'llm_tagger',
      config_json: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: 'extract',
        outputs: [
          { tag_key: 'payee', value_type: 'string' },
          { tag_key: 'amount', value_type: 'money' },
        ],
      }),
    }
    const bad: OperatorForValidation = {
      operator_id: 3,
      type_key: 'digest_delivery',
      config_json: JSON.stringify({
        schedule: '0 8 * * *',
        sections: [
          {
            category: 'bill',
            title: 'Bills',
            render: 'list',
            item_template: '{{tag.payee}}',
            highlight: { tag_key: 'payee', over: 'z' },
          },
        ],
        summary_model_id: null,
      }),
    }
    const good: OperatorForValidation = {
      ...bad,
      config_json: JSON.stringify({
        schedule: '0 8 * * *',
        sections: [
          {
            category: 'bill',
            title: 'Bills',
            render: 'list',
            item_template: '{{tag.payee}}',
            highlight: { tag_key: 'amount', over: '10000:USD' },
          },
        ],
        summary_model_id: null,
      }),
    }
    expect(saveTimeValidationErrors(bad, [producer, payee, bad])).toMatchObject([
      { kind: 'invalid_digest_section', operatorId: 3, category: 'bill' },
    ])
    expect(saveTimeValidationErrors(good, [producer, payee, good])).toEqual([])
  })

  it('rejects sections when the digest_category producer is itself extracted', () => {
    const producer: OperatorForValidation = {
      operator_id: 1,
      type_key: 'llm_tagger',
      config_json: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: 'p',
        outputs: [{ tag_key: 'digest_category', value_type: 'string' }],
      }),
    }
    const edition = digestEdition(2, ['bill'])
    const errors = saveTimeValidationErrors(edition, [producer, edition])
    expect(errors.some((e) => e.kind === 'invalid_digest_section' && e.message.includes('closed enum'))).toBe(true)
  })
})
