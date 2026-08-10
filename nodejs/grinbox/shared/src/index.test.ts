import { describe, expect, it } from 'vitest'
import {
  OPERATOR_TYPE_TRIGGERS,
  contractFromConfig,
  isResourceOperation,
  isScheduledOperatorType,
  operatorConfigSchemas,
  operatorTypeKeySchema,
  resourceOperationDeclarationSchema,
} from './index.js'

describe('resource registry', () => {
  it('validates an operation declared for its resource', () => {
    expect(
      resourceOperationDeclarationSchema.safeParse({
        resource: 'mailbox',
        operations: ['apply_category', 'archive'],
      }).success,
    ).toBe(true)
  })

  it('rejects an operation not declared for its resource', () => {
    const result = resourceOperationDeclarationSchema.safeParse({
      resource: 'pushover_api',
      operations: ['apply_category'], // belongs to mailbox, not pushover_api
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      // The rejection must point at the operations list (the per-resource
      // membership superRefine), not at an unrelated field — otherwise a
      // regression elsewhere would pass this test for the wrong reason.
      expect(result.error.issues[0]?.path).toEqual(['operations'])
    }
  })

  it('rejects an unknown resource', () => {
    const result = resourceOperationDeclarationSchema.safeParse({
      resource: 'sms_api',
      operations: ['send'],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['resource'])
    }
  })

  it('isResourceOperation guards per-resource operation validity', () => {
    expect(isResourceOperation('mailbox', 'apply_category')).toBe(true)
    expect(isResourceOperation('mailbox', 'send_notification')).toBe(false)
  })
})

describe('llm_tagger config', () => {
  const valid = {
    model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    prompt_template: 'Classify: {{subject}}',
    outputs: [
      { tag_key: 'is_vip', value_enum: ['yes', 'no'] },
      { tag_key: 'urgency', value_enum: ['high', 'low'] },
    ],
  }

  it('accepts a valid multi-output config', () => {
    expect(operatorConfigSchemas.llm_tagger.safeParse(valid).success).toBe(true)
  })

  it('accepts a single-output config', () => {
    expect(
      operatorConfigSchemas.llm_tagger.safeParse({
        ...valid,
        outputs: [{ tag_key: 'is_vip', value_enum: ['yes', 'no'] }],
      }).success,
    ).toBe(true)
  })

  it('rejects a config missing prompt_template', () => {
    const { prompt_template: _omit, ...invalid } = valid
    const result = operatorConfigSchemas.llm_tagger.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      // Must reject *because prompt_template is required*, not for some unrelated
      // reason (e.g. another required field regressing to optional).
      expect(result.error.issues[0]?.path).toEqual(['prompt_template'])
      expect(result.error.issues[0]?.code).toBe('invalid_type')
    }
  })

  it('rejects a config missing model_id', () => {
    const { model_id: _omit, ...invalid } = valid
    const result = operatorConfigSchemas.llm_tagger.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['model_id'])
    }
  })

  it('rejects a model_id outside the offered set', () => {
    const result = operatorConfigSchemas.llm_tagger.safeParse({
      ...valid,
      model_id: 'anthropic.claude-opus-9',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['model_id'])
    }
  })

  it('rejects an empty outputs array', () => {
    expect(
      operatorConfigSchemas.llm_tagger.safeParse({
        ...valid,
        outputs: [],
      }).success,
    ).toBe(false)
  })

  it('rejects an empty value_enum on an output', () => {
    expect(
      operatorConfigSchemas.llm_tagger.safeParse({
        ...valid,
        outputs: [{ tag_key: 'is_vip', value_enum: [] }],
      }).success,
    ).toBe(false)
  })

  it('rejects a duplicate tag_key across outputs', () => {
    const result = operatorConfigSchemas.llm_tagger.safeParse({
      ...valid,
      outputs: [
        { tag_key: 'is_vip', value_enum: ['yes', 'no'] },
        { tag_key: 'is_vip', value_enum: ['a', 'b'] },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['outputs', 1, 'tag_key'])
    }
  })
})

describe('rule_based_tagger config', () => {
  const valid = {
    output_tag_key: 'urgency',
    output_value_enum: ['high', 'low'],
    rules: [{ match: "from contains 'boss@'", output: 'high' }],
    fallback: { output: 'low' },
  }

  it('accepts a valid config with a fallback', () => {
    expect(operatorConfigSchemas.rule_based_tagger.safeParse(valid).success).toBe(true)
  })

  it('accepts an empty rules list (fallback-only is legal)', () => {
    // A Rule-based Tagger with no rules degenerates to "always emit the
    // fallback" — still a complete, contract-satisfying Tagger. The schema must
    // accept this (rules is a plain array, not `.nonempty()`).
    expect(
      operatorConfigSchemas.rule_based_tagger.safeParse({
        ...valid,
        rules: [],
      }).success,
    ).toBe(true)
  })

  it('rejects a rule list without a fallback (missing fallback field)', () => {
    const { fallback: _omit, ...invalid } = valid
    expect(operatorConfigSchemas.rule_based_tagger.safeParse(invalid).success).toBe(false)
  })

  it('rejects a "*" match smuggled into the rules list', () => {
    const result = operatorConfigSchemas.rule_based_tagger.safeParse({
      ...valid,
      rules: [{ match: '*', output: 'low' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['rules', 0, 'match'])
    }
  })

  it('rejects a rule output outside output_value_enum', () => {
    const result = operatorConfigSchemas.rule_based_tagger.safeParse({
      ...valid,
      rules: [{ match: 'x', output: 'medium' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['rules', 0, 'output'])
    }
  })

  it('rejects a fallback output outside output_value_enum', () => {
    // Symmetric to the rule-output check: the fallback's default value must also
    // be a member of output_value_enum (operators.ts fallback-output superRefine).
    const result = operatorConfigSchemas.rule_based_tagger.safeParse({
      ...valid,
      fallback: { output: 'medium' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['fallback', 'output'])
    }
  })
})

describe('notify config', () => {
  it('accepts a valid config', () => {
    expect(
      operatorConfigSchemas.notify.safeParse({
        message_template: 'New VIP mail: {{subject}}',
        credentials_id: 3,
      }).success,
    ).toBe(true)
  })

  it('rejects a non-positive credentials_id', () => {
    expect(
      operatorConfigSchemas.notify.safeParse({
        message_template: 'x',
        credentials_id: 0,
      }).success,
    ).toBe(false)
  })

  it('rejects a config missing message_template', () => {
    const result = operatorConfigSchemas.notify.safeParse({
      credentials_id: 3,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['message_template'])
      expect(result.error.issues[0]?.code).toBe('invalid_type')
    }
  })
})

describe('apply_category config', () => {
  it('accepts a valid config', () => {
    expect(
      operatorConfigSchemas.apply_category.safeParse({
        category_template: 'Grinbox/VIP',
      }).success,
    ).toBe(true)
  })

  it('rejects an empty category_template', () => {
    expect(
      operatorConfigSchemas.apply_category.safeParse({
        category_template: '',
      }).success,
    ).toBe(false)
  })
})

describe('digest_delivery config', () => {
  const listSection = {
    category: 'bill',
    title: 'Bills',
    render: 'list',
    item_template: '{{tag.payee}} — {{tag.amount}}',
  }
  const base = {
    schedule: '0 8 * * *',
    sections: [listSection],
    summary_model_id: null,
  }

  it('accepts a valid list-section edition', () => {
    expect(operatorConfigSchemas.digest_delivery.safeParse(base).success).toBe(true)
  })

  it('accepts table and count sections with their shape fields', () => {
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        sections: [
          {
            category: 'receipt',
            title: 'Receipts',
            render: 'table',
            columns: [
              { header: 'From', template: '{{from}}' },
              { header: 'Amount', template: '{{tag.amount}}' },
            ],
            highlight: { tag_key: 'amount', over: '10000:USD' },
          },
          { category: 'release', title: 'Releases', render: 'count' },
        ],
      }).success,
    ).toBe(true)
  })

  it('rejects a list section without item_template (and table without columns)', () => {
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        sections: [{ category: 'bill', title: 'Bills', render: 'list' }],
      }).success,
    ).toBe(false)
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        sections: [{ category: 'r', title: 'R', render: 'table' }],
      }).success,
    ).toBe(false)
  })

  it('rejects shape fields on the wrong render kind', () => {
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        sections: [
          {
            category: 'release',
            title: 'Releases',
            render: 'count',
            item_template: 'x',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate section categories within an edition', () => {
    const result = operatorConfigSchemas.digest_delivery.safeParse({
      ...base,
      sections: [listSection, { ...listSection, title: 'Bills again' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['sections', 1, 'category'])
    }
  })

  it('requires summary_model_id when any section declares llm prose', () => {
    const withLlmProse = {
      ...base,
      sections: [{ ...listSection, before: { kind: 'llm', prompt: 'One sentence.' } }],
    }
    expect(operatorConfigSchemas.digest_delivery.safeParse(withLlmProse).success).toBe(false)
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...withLlmProse,
        summary_model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      }).success,
    ).toBe(true)
    // A 'text' prose block needs no model.
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        sections: [{ ...listSection, after: { kind: 'text', text: 'Pay on time.' } }],
      }).success,
    ).toBe(true)
  })

  it('rejects a config missing schedule or sections', () => {
    const noSchedule = operatorConfigSchemas.digest_delivery.safeParse({
      sections: [listSection],
      summary_model_id: null,
    })
    expect(noSchedule.success).toBe(false)
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        schedule: '0 8 * * *',
        sections: [],
        summary_model_id: null,
      }).success,
    ).toBe(false)
  })

  it('accepts an optional timezone and rejects an empty one', () => {
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        timezone: 'America/New_York',
      }).success,
    ).toBe(true)
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        ...base,
        timezone: '',
      }).success,
    ).toBe(false)
  })
})

describe('OPERATOR_TYPE_TRIGGERS', () => {
  it('marks only digest_delivery as schedule-triggered', () => {
    const scheduled = operatorTypeKeySchema.options.filter((key) => isScheduledOperatorType(key))
    expect(scheduled).toEqual(['digest_delivery'])
    expect(OPERATOR_TYPE_TRIGGERS.digest_delivery).toBe('schedule')
    expect(OPERATOR_TYPE_TRIGGERS.notify).toBe('message')
  })
})

describe('contractFromConfig', () => {
  it('derives one output per LLM Tagger outputs[] entry and declares the LLM resource', () => {
    const contract = contractFromConfig('llm_tagger', {
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
      prompt_template: 'p',
      outputs: [
        { tag_key: 'is_vip', value_enum: ['yes', 'no'] },
        { tag_key: 'urgency', value_enum: ['high', 'low'] },
      ],
    })
    expect(contract.outputs).toEqual([
      { key: 'is_vip', valueEnum: ['yes', 'no'] },
      { key: 'urgency', valueEnum: ['high', 'low'] },
    ])
    expect(contract.resources).toEqual([{ resource: 'llm_bedrock', operations: ['invoke_model'] }])
  })

  it('declares Notify static resource and no outputs', () => {
    const contract = contractFromConfig('notify', {
      message_template: 'x',
      credentials_id: 1,
    })
    expect(contract.outputs).toEqual([])
    expect(contract.resources).toEqual([{ resource: 'pushover_api', operations: ['send_notification'] }])
  })

  it('declares both Digest resources and derives its collation inputs', () => {
    const contract = contractFromConfig('digest_delivery', {
      schedule: '0 8 * * *',
      sections: [
        {
          category: 'bill',
          title: 'Bills',
          render: 'list',
          item_template: '{{tag.payee}} — {{tag.amount}}',
        },
        {
          category: 'receipt',
          title: 'Receipts',
          render: 'table',
          columns: [
            { header: 'From', template: '{{from}}' },
            { header: 'Total', template: '{{tag.total}}' },
          ],
          highlight: { tag_key: 'total', over: '10000:USD' },
        },
      ],
      summary_model_id: null,
    })
    expect(contract.resources).toEqual([
      { resource: 'llm_bedrock', operations: ['invoke_model'] },
      { resource: 'mail_sender', operations: ['send_message'] },
    ])
    // digest_category first, then template refs / highlight keys, deduped.
    expect(contract.inputs).toEqual(['digest_category', 'payee', 'amount', 'total'])
    expect(contract.outputs).toEqual([])
  })

  it('derives typed LLM Tagger outputs and the when-gate input', () => {
    const contract = contractFromConfig('llm_tagger', {
      model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
      prompt_template: 'p',
      outputs: [
        { tag_key: 'payee', value_type: 'string' },
        { tag_key: 'amount', value_type: 'money' },
        { tag_key: 'kind', value_enum: ['a', 'b'] },
      ],
      when: { tag_key: 'digest_category', equals: ['bill'] },
    })
    expect(contract.outputs).toEqual([
      { key: 'payee', valueType: 'string' },
      { key: 'amount', valueType: 'money' },
      { key: 'kind', valueEnum: ['a', 'b'] },
    ])
    expect(contract.inputs).toContain('digest_category')
  })
})
