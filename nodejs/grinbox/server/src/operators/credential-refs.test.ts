import { describe, expect, it } from 'vitest'
import { extractCredentialRefsFromConfigJson, extractCredentialRefsFromOperatorConfig } from './credential-refs.js'

describe('extractCredentialRefsFromOperatorConfig', () => {
  it('returns [] for a Rule-based Tagger (no credentials)', () => {
    expect(
      extractCredentialRefsFromOperatorConfig('rule_based_tagger', {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'normal'],
        rules: [],
        fallback: { output: 'normal' },
      }),
    ).toEqual([])
  })

  it('returns [] for an LLM Tagger', () => {
    expect(
      extractCredentialRefsFromOperatorConfig('llm_tagger', {
        model_id: 'm',
        prompt_template: 'p',
        outputs: [{ tag_key: 'k', value_enum: ['a', 'b'] }],
      }),
    ).toEqual([])
  })

  it('returns [credentials_id] for Notify', () => {
    expect(
      extractCredentialRefsFromOperatorConfig('notify', {
        message_template: 'hi',
        credentials_id: 7,
      }),
    ).toEqual([7])
  })

  it('returns [] for Apply Category and Digest delivery', () => {
    expect(
      extractCredentialRefsFromOperatorConfig('apply_category', {
        category_template: 'Bills',
      }),
    ).toEqual([])
    expect(
      extractCredentialRefsFromOperatorConfig('digest_delivery', {
        schedule: '0 8 * * *',
        model_id: 'm',
        prompt_template: 'p',
      }),
    ).toEqual([])
  })
})

describe('extractCredentialRefsFromConfigJson', () => {
  it('parses then extracts in one step', () => {
    const json = JSON.stringify({ message_template: 'hi', credentials_id: 12 })
    expect(extractCredentialRefsFromConfigJson('notify', json)).toEqual([12])
  })

  it('throws on config invalid for the type', () => {
    expect(() => extractCredentialRefsFromConfigJson('notify', '{"message_template":"hi"}')).toThrow()
  })
})
