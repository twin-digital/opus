import { describe, expect, it } from 'vitest'
import {
  accountCapabilitiesSchema,
  accountCapabilityWarningSchema,
  ACCOUNT_CAPABILITIES,
  capabilitiesRequiredBy,
  contractFromConfig,
  MAIL_BACKEND_KINDS,
} from './index.js'

// --- the backends an Account may be added with (d-oevikmal) ---------------

describe('MAIL_BACKEND_KINDS', () => {
  it('offers the backends grinbox ships', () => {
    expect(MAIL_BACKEND_KINDS).toEqual(['gmail', 'imap'])
  })
})

// --- what an Account can carry (d-bzw8qoiy, d-f9tj4wnr) -------------------

describe('accountCapabilitiesSchema', () => {
  it('is the set of Account-dependent operations', () => {
    expect(ACCOUNT_CAPABILITIES).toEqual(['apply_category', 'archive', 'file', 'send_message'])
  })

  it('reads an Account that can categorize and move but not send', () => {
    expect(accountCapabilitiesSchema.safeParse(['apply_category', 'archive', 'file']).success).toBe(true)
  })

  it('reads an Account that can carry nothing', () => {
    expect(accountCapabilitiesSchema.safeParse([]).success).toBe(true)
  })

  it('refuses an operation whose availability does not turn on the Account', () => {
    expect(accountCapabilitiesSchema.safeParse(['fetch_body']).success).toBe(false)
  })
})

describe('capabilitiesRequiredBy', () => {
  it('reports nothing for an Operator that reaches no Account-dependent operation', () => {
    const contract = contractFromConfig('rule_based_tagger', {
      output_tag_key: 'urgency',
      output_value_enum: ['high', 'low'],
      rules: [],
      fallback: { output: 'low' },
    })
    expect(capabilitiesRequiredBy(contract)).toEqual([])
  })

  it('reports the one an archive needs', () => {
    expect(capabilitiesRequiredBy(contractFromConfig('archive', {}))).toEqual(['archive'])
  })

  it('reports both halves a set-aside declares', () => {
    const contract = contractFromConfig('set_aside', { category_template: 'Grinbox/Later', folder: 'Later' })
    expect(capabilitiesRequiredBy(contract)).toEqual(['apply_category', 'file'])
  })

  it('reports what a file action needs', () => {
    expect(capabilitiesRequiredBy(contractFromConfig('file', { folder: 'Later' }))).toEqual(['file'])
  })
})

// --- the gap is reported, never refused at save (d-qzxvoph1) --------------

describe('accountCapabilityWarningSchema', () => {
  it('names the capability, the Operators needing it, and the Accounts without it', () => {
    const parsed = accountCapabilityWarningSchema.safeParse({
      capability: 'send_message',
      operator_ids: [7],
      account_ids: [2, 3],
    })
    expect(parsed.success).toBe(true)
  })
})
