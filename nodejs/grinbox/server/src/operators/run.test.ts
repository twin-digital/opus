import {
  type RuleBasedTaggerConfig,
  contractFromConfig,
  ruleBasedTaggerConfigSchema,
} from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { MatchExpressionError } from './built-ins/match-expression.js'
import { InvalidOperatorConfigError, type OperatorSnapshot, OutputTagValidationError, runOperator } from './run.js'
import { createFakeResourceClients } from './testing.js'
import type { MessageView, OperatorType } from './types.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'm1',
    from: 'boss@example.com',
    from_email: 'boss@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'URGENT: server down',
    snippet: '',
    bodyText: '',
    bodyHtml: null,
    receivedAt: 0,
    headers: new Map(),
    thread: null,
    ...over,
  }
}

function snapshot(config: RuleBasedTaggerConfig): OperatorSnapshot {
  return {
    type_key: 'rule_based_tagger',
    type_code_version: '1',
    op_config_json: JSON.stringify(config),
  }
}

const urgencyConfig: RuleBasedTaggerConfig = {
  output_tag_key: 'urgency',
  output_value_enum: ['high', 'normal'],
  rules: [
    { match: 'subject contains "URGENT"', output: 'high' },
    { match: 'from == "boss@example.com"', output: 'high' },
  ],
  fallback: { output: 'normal' },
}

function args(msg = message(), tags: Record<string, string> = {}) {
  const fake = createFakeResourceClients()
  return {
    runArgs: {
      message: msg,
      tags: new Map(Object.entries(tags)),
      makeResourceClient: fake.factory,
      signal: new AbortController().signal,
    },
    fake,
  }
}

describe('runOperator with O1 (Rule-based Tagger)', () => {
  it('matches a Message field and emits the matched value', async () => {
    const { runArgs } = args(message({ subject: 'URGENT: server down' }))
    const result = await runOperator(snapshot(urgencyConfig), runArgs)
    expect(result.tags).toEqual([{ key: 'urgency', value: 'high' }])
  })

  it('first matching rule wins when later rules would emit a different value', async () => {
    // Both rules match this Message, but they emit DIFFERENT values: rule[0]
    // -> high, rule[1] -> normal. First-match-wins requires high.
    const config: RuleBasedTaggerConfig = {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'normal'],
      rules: [
        { match: 'subject contains "URGENT"', output: 'high' },
        { match: 'subject contains "URGENT"', output: 'normal' },
      ],
      fallback: { output: 'normal' },
    }
    const { runArgs } = args(message({ subject: 'URGENT: server down' }))
    const result = await runOperator(snapshot(config), runArgs)
    expect(result.tags).toEqual([{ key: 'urgency', value: 'high' }])
  })

  it('uses a later rule only when the earlier one does not match', async () => {
    // Inverse ordering: rule[0] (-> high) does NOT match; rule[1] (-> normal)
    // does. The result must be the second rule's value, proving the loop does
    // not stop at the first rule unconditionally.
    const config: RuleBasedTaggerConfig = {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'normal'],
      rules: [
        { match: 'subject contains "URGENT"', output: 'high' },
        { match: 'from == "boss@example.com"', output: 'normal' },
      ],
      fallback: { output: 'high' },
    }
    const { runArgs } = args(message({ subject: 'lunch?', from: 'boss@example.com' }))
    const result = await runOperator(snapshot(config), runArgs)
    expect(result.tags).toEqual([{ key: 'urgency', value: 'normal' }])
  })

  it('fails the run when a rule match expression is malformed', async () => {
    const config: RuleBasedTaggerConfig = {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'normal'],
      rules: [{ match: 'subject @@@ "x"', output: 'high' }],
      fallback: { output: 'normal' },
    }
    const { runArgs } = args(message())
    await expect(runOperator(snapshot(config), runArgs)).rejects.toThrow(MatchExpressionError)
  })

  it('matches on an input tag.<key>', async () => {
    const config: RuleBasedTaggerConfig = {
      output_tag_key: 'route',
      output_value_enum: ['vip', 'standard'],
      rules: [{ match: 'tag.sender_class == "executive"', output: 'vip' }],
      fallback: { output: 'standard' },
    }
    const { runArgs } = args(message({ subject: 'hi' }), {
      sender_class: 'executive',
    })
    const result = await runOperator(snapshot(config), runArgs)
    expect(result.tags).toEqual([{ key: 'route', value: 'vip' }])
  })

  it('falls through to the fallback when no rule matches', async () => {
    const { runArgs } = args(message({ subject: 'lunch?', from: 'friend@example.com' }))
    const result = await runOperator(snapshot(urgencyConfig), runArgs)
    expect(result.tags).toEqual([{ key: 'urgency', value: 'normal' }])
  })

  it('declares no resources, so the client factory is never invoked', async () => {
    const { runArgs, fake } = args()
    await runOperator(snapshot(urgencyConfig), runArgs)
    expect(fake.calls).toHaveLength(0)
  })

  it('rejects invalid op_config_json at parse', async () => {
    const { runArgs } = args()
    const bad: OperatorSnapshot = {
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: '{ not json',
    }
    await expect(runOperator(bad, runArgs)).rejects.toThrow(InvalidOperatorConfigError)
  })

  it('rejects config that violates the schema', async () => {
    const { runArgs } = args()
    // fallback output not in the value enum → shared schema superRefine fails.
    const invalid = {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'normal'],
      rules: [],
      fallback: { output: 'bogus' },
    }
    const snap: OperatorSnapshot = {
      type_key: 'rule_based_tagger',
      type_code_version: '1',
      op_config_json: JSON.stringify(invalid),
    }
    await expect(runOperator(snap, runArgs)).rejects.toThrow(InvalidOperatorConfigError)
  })
})

describe('runOperator output-Tag validation', () => {
  // The Rule-based Tagger's shared schema makes an out-of-enum config
  // unrepresentable, so we exercise runOperator's output validator with a
  // synthetic type injected via `resolve` (the only purpose of that seam): a
  // type whose run() deliberately emits a value outside its declared enum.
  function syntheticType(emit: { key: string; value: string }): OperatorType {
    const t: OperatorType<'rule_based_tagger'> = {
      type_key: 'rule_based_tagger',
      code_version: '1',
      configSchema: ruleBasedTaggerConfigSchema,
      contractFromConfig: (c) => contractFromConfig('rule_based_tagger', c),
      run: async () => ({ tags: [emit] }),
      extractCredentialRefsFromOperatorConfig: () => [],
    }
    return t
  }

  it('rejects an out-of-enum output Tag value', async () => {
    const fake = createFakeResourceClients()
    const runArgs = {
      message: message(),
      tags: new Map<string, string>(),
      makeResourceClient: fake.factory,
      signal: new AbortController().signal,
      resolve: () => syntheticType({ key: 'urgency', value: 'EXTREME' }),
    }
    await expect(runOperator(snapshot(urgencyConfig), runArgs)).rejects.toThrow(OutputTagValidationError)
  })

  it('rejects an undeclared output Tag key', async () => {
    const fake = createFakeResourceClients()
    const runArgs = {
      message: message(),
      tags: new Map<string, string>(),
      makeResourceClient: fake.factory,
      signal: new AbortController().signal,
      resolve: () => syntheticType({ key: 'not_declared', value: 'high' }),
    }
    await expect(runOperator(snapshot(urgencyConfig), runArgs)).rejects.toThrow(OutputTagValidationError)
  })
})
