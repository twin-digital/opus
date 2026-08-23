import { describe, expect, it } from 'vitest'
import {
  accountCapabilitiesSchema,
  accountCapabilityWarningSchema,
  accountSupports,
  ACCOUNT_CAPABILITIES,
  capabilitiesRequiredBy,
  capabilityAbsenceReason,
  contractFromConfig,
  MAIL_BACKEND_KINDS,
} from './index.js'
import type { AccountCapabilities } from './index.js'

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

  it('reads an Account that can categorize and move but not send, and why', () => {
    const parsed = accountCapabilitiesSchema.safeParse({
      supported: ['apply_category', 'archive', 'file'],
      unsupported: { send_message: 'an IMAP account cannot send mail' },
      read_at: 1_760_000_000,
    })
    expect(parsed.success).toBe(true)
  })

  it('reads an Account that can carry nothing', () => {
    expect(
      accountCapabilitiesSchema.safeParse({
        supported: [],
        unsupported: {
          apply_category: 'the arrival folder admits no keywords',
          archive: 'the server advertises no safe move',
          file: 'the server advertises no safe move',
          send_message: 'an IMAP account cannot send mail',
        },
        read_at: 1_760_000_000,
      }).success,
    ).toBe(true)
  })

  it('refuses an operation whose availability does not turn on the Account', () => {
    expect(
      accountCapabilitiesSchema.safeParse({ supported: ['fetch_body'], unsupported: {}, read_at: 0 }).success,
    ).toBe(false)
  })

  it('refuses a capability declared both ways', () => {
    expect(
      accountCapabilitiesSchema.safeParse({
        supported: ['archive'],
        unsupported: { archive: 'no safe move' },
        read_at: 0,
      }).success,
    ).toBe(false)
  })
})

describe('reading a declaration', () => {
  const declaration: AccountCapabilities = {
    supported: ['apply_category', 'archive', 'file'],
    unsupported: { send_message: 'an IMAP account cannot send mail' },
    read_at: 1_760_000_000,
  }

  it('admits what the Account carries', () => {
    expect(accountSupports(declaration, 'archive')).toBe(true)
    expect(accountSupports(declaration, 'send_message')).toBe(false)
  })

  it('admits nothing where grinbox has not logged in yet', () => {
    expect(accountSupports(null, 'archive')).toBe(false)
    expect(capabilityAbsenceReason(null, 'archive')).toBeNull()
  })

  it('says why a gap is a gap, and nothing where there is none', () => {
    expect(capabilityAbsenceReason(declaration, 'send_message')).toBe('an IMAP account cannot send mail')
    expect(capabilityAbsenceReason(declaration, 'archive')).toBeNull()
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
