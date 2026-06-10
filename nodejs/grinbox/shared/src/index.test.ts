import { describe, expect, it } from 'vitest'
import {
  contractFromConfig,
  isResourceOperation,
  operatorConfigSchemas,
  resourceOperationDeclarationSchema,
} from './index.js'

describe('resource registry', () => {
  it('validates an operation declared for its resource', () => {
    expect(
      resourceOperationDeclarationSchema.safeParse({
        resource: 'gmail_api',
        operations: ['apply_label', 'send_message'],
      }).success,
    ).toBe(true)
  })

  it('rejects an operation not declared for its resource', () => {
    const result = resourceOperationDeclarationSchema.safeParse({
      resource: 'pushover_api',
      operations: ['apply_label'], // belongs to gmail_api, not pushover_api
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
    expect(isResourceOperation('gmail_api', 'apply_label')).toBe(true)
    expect(isResourceOperation('gmail_api', 'send_notification')).toBe(false)
  })
})

describe('llm_tagger config', () => {
  const valid = {
    model_id: 'anthropic.claude-haiku',
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
      expect(result.error.issues[0]?.code).toBe('invalid_type')
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
  it('accepts a valid config', () => {
    expect(
      operatorConfigSchemas.digest_delivery.safeParse({
        schedule: '0 8 * * *',
        model_id: 'anthropic.claude-sonnet',
        prompt_template: 'Summarize: {{messages}}',
      }).success,
    ).toBe(true)
  })

  it('rejects a config missing schedule', () => {
    const result = operatorConfigSchemas.digest_delivery.safeParse({
      model_id: 'anthropic.claude-sonnet',
      prompt_template: 'x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['schedule'])
      expect(result.error.issues[0]?.code).toBe('invalid_type')
    }
  })

  it('rejects a config missing model_id', () => {
    const result = operatorConfigSchemas.digest_delivery.safeParse({
      schedule: '0 8 * * *',
      prompt_template: 'x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['model_id'])
      expect(result.error.issues[0]?.code).toBe('invalid_type')
    }
  })

  it('rejects a config missing prompt_template', () => {
    const result = operatorConfigSchemas.digest_delivery.safeParse({
      schedule: '0 8 * * *',
      model_id: 'anthropic.claude-sonnet',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['prompt_template'])
      expect(result.error.issues[0]?.code).toBe('invalid_type')
    }
  })
})

describe('contractFromConfig', () => {
  it('derives one output per LLM Tagger outputs[] entry and declares the LLM resource', () => {
    const contract = contractFromConfig('llm_tagger', {
      model_id: 'm',
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

  it('declares both Digest resources', () => {
    const contract = contractFromConfig('digest_delivery', {
      schedule: '0 8 * * *',
      model_id: 'm',
      prompt_template: 'p',
    })
    expect(contract.resources).toEqual([
      { resource: 'llm_bedrock', operations: ['invoke_model'] },
      { resource: 'gmail_api', operations: ['send_message'] },
    ])
  })
})
