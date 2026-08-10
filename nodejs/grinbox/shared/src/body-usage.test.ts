import { describe, expect, it } from 'vitest'
import { operatorConsumesBody } from './body-usage.js'
import type { OperatorConfigFor } from './operators.js'

/**
 * `operatorConsumesBody` decides whether a run triggers the lazy body fetch:
 * a `{{body}}` placeholder in the type's rendered template, or a Rule `match`
 * reading the bare `body` field. Everything else — other placeholders, tag
 * refs, digest configs — reads no body.
 */
describe('operatorConsumesBody', () => {
  function llmConfig(promptTemplate: string): OperatorConfigFor<'llm_tagger'> {
    return {
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
      prompt_template: promptTemplate,
      outputs: [{ tag_key: 'kind', value_enum: ['a', 'b'] }],
    }
  }

  function rulesConfig(matches: string[]): OperatorConfigFor<'rule_based_tagger'> {
    return {
      output_tag_key: 'kind',
      output_value_enum: ['yes', 'no'],
      rules: matches.map((match) => ({ match, output: 'yes' })),
      fallback: { output: 'no' },
    }
  }

  it('llm_tagger: true when the prompt references {{body}}', () => {
    expect(operatorConsumesBody('llm_tagger', llmConfig('classify {{body}}'))).toBe(true)
  })

  it('llm_tagger: false when the prompt reads only other fields', () => {
    expect(operatorConsumesBody('llm_tagger', llmConfig('classify {{subject}} {{snippet}}'))).toBe(false)
  })

  it('notify: keyed on {{body}} in message_template', () => {
    const withBody: OperatorConfigFor<'notify'> = {
      message_template: 'alert: {{body}}',
      credentials_id: 1,
    }
    const without: OperatorConfigFor<'notify'> = {
      message_template: 'alert: {{subject}}',
      credentials_id: 1,
    }
    expect(operatorConsumesBody('notify', withBody)).toBe(true)
    expect(operatorConsumesBody('notify', without)).toBe(false)
  })

  it('apply_category: keyed on {{body}} in category_template', () => {
    const withBody: OperatorConfigFor<'apply_category'> = {
      category_template: 'cat-{{body}}',
    }
    const without: OperatorConfigFor<'apply_category'> = {
      category_template: 'cat-{{tag.kind}}',
    }
    expect(operatorConsumesBody('apply_category', withBody)).toBe(true)
    expect(operatorConsumesBody('apply_category', without)).toBe(false)
  })

  it('rule_based_tagger: true when any Rule match reads the body field', () => {
    expect(
      operatorConsumesBody('rule_based_tagger', rulesConfig(['from contains "a"', 'body contains "invoice"'])),
    ).toBe(true)
  })

  it('rule_based_tagger: false for Rules over other fields', () => {
    expect(
      operatorConsumesBody('rule_based_tagger', rulesConfig(['subject contains "invoice"', 'tag.kind == "body"'])),
    ).toBe(false)
  })

  it('rule_based_tagger: an unparseable Rule contributes nothing', () => {
    const config = rulesConfig(['((('])
    expect(operatorConsumesBody('rule_based_tagger', config)).toBe(false)
  })

  it('digest_delivery: never consumes the per-Message body', () => {
    const config: OperatorConfigFor<'digest_delivery'> = {
      schedule: '0 7 * * *',
      sections: [
        {
          category: 'bill',
          title: 'Bills',
          render: 'list',
          item_template: '{{subject}} {{body}}',
        },
      ],
      summary_model_id: null,
    }
    expect(operatorConsumesBody('digest_delivery', config)).toBe(false)
  })
})
