import type { AccountSummary, OperatorDetail } from '@grinbox/server'
import { contractFromConfig } from '@grinbox/shared'
import { describe, expect, it } from 'vitest'

import {
  accountSupports,
  accountsLacking,
  describeWarnings,
  deriveCapabilityWarnings,
  unsupportedReason,
  warningsFromResponse,
} from './capabilities'

/**
 * Which Accounts cannot carry what a configuration names (d-qzxvoph1), and the
 * reason each gap carries (d-5h66e3zl, d-jl5giafw).
 */

function account(id: number, name: string, capabilities: AccountSummary['capabilities']): AccountSummary {
  return {
    id,
    name,
    icon: null,
    color: null,
    provider_type: 'imap',
    active_pipeline_id: null,
    active_pipeline_name: null,
    last_polled_at: null,
    poll_interval_seconds: 300,
    status: 'ok',
    capabilities,
    paused_reason: null,
    imap: null,
  }
}

function operator(
  id: number,
  typeKey: 'file' | 'digest_delivery' | 'rule_based_tagger',
  config: unknown,
): OperatorDetail {
  return {
    id,
    name: `operator ${String(id)}`,
    type_key: typeKey,
    enabled: true,
    group: 0,
    contract: contractFromConfig(typeKey, config as never),
    config,
  }
}

const FILE_OPERATOR = operator(1, 'file', { folder: 'Later' })

const GMAIL = account(1, 'sean@example.com', {
  supported: ['apply_category', 'archive', 'file', 'send_message'],
  unsupported: {},
  read_at: 100,
})

const IMAP = account(2, 'mail@example.net', {
  supported: ['apply_category', 'archive'],
  unsupported: {
    file: 'this server offers no safe way to move a message',
    send_message: 'grinbox cannot send mail through IMAP',
  },
  read_at: 100,
})

/** Never polled: nothing has been read from it yet. */
const UNREAD = account(3, 'new@example.net', null)

describe('what an Account carries', () => {
  it('reads the stored declaration', () => {
    expect(accountSupports(GMAIL, 'file')).toBe(true)
    expect(accountSupports(IMAP, 'file')).toBe(false)
  })

  it('gives the reason a capability is absent, in the backend’s words (d-5h66e3zl)', () => {
    expect(unsupportedReason(IMAP, 'send_message')).toBe('grinbox cannot send mail through IMAP')
    expect(unsupportedReason(GMAIL, 'send_message')).toBeNull()
  })

  it('treats an unread declaration as unknown, not as a gap', () => {
    expect(unsupportedReason(UNREAD, 'send_message')).toBeNull()
    expect(accountsLacking([GMAIL, IMAP, UNREAD], 'file').map((a) => a.id)).toEqual([2])
  })
})

describe('deriveCapabilityWarnings (d-qzxvoph1, d-x198jell)', () => {
  it('names the capability, the Operators needing it, and the Accounts lacking it', () => {
    expect(deriveCapabilityWarnings([FILE_OPERATOR], [GMAIL, IMAP])).toEqual([
      { capability: 'file', operator_ids: [1], account_ids: [2] },
    ])
  })

  it('warns for nothing where every Account carries it', () => {
    expect(deriveCapabilityWarnings([FILE_OPERATOR], [GMAIL])).toEqual([])
  })

  it('warns that an edition claims no occurrence on an Account that cannot send (d-5h66e3zl)', () => {
    const edition = operator(4, 'digest_delivery', {
      schedule: '0 20 * * *',
      sections: [{ category: 'news', title: 'News', render: 'count' }],
    })
    const warnings = deriveCapabilityWarnings([edition], [GMAIL, IMAP])
    expect(warnings).toEqual([{ capability: 'send_message', operator_ids: [4], account_ids: [2] }])
  })

  it('passes over a disabled Operator and one whose Contract would not derive', () => {
    const disabled = { ...FILE_OPERATOR, id: 5, enabled: false }
    const unparsed = { ...FILE_OPERATOR, id: 6, contract: null }
    expect(deriveCapabilityWarnings([disabled, unparsed], [IMAP])).toEqual([])
  })

  it('reads an Operator needing nothing of the Account as needing nothing', () => {
    const tagger = operator(7, 'rule_based_tagger', {
      output_tag_key: 'kind',
      output_value_enum: ['a', 'b'],
      rules: [],
      fallback: { output: 'a' },
    })
    expect(deriveCapabilityWarnings([tagger], [IMAP])).toEqual([])
  })
})

describe('warningsFromResponse', () => {
  it('reads the warnings a successful write answered with', () => {
    const warnings = warningsFromResponse({
      id: 3,
      warnings: [{ capability: 'file', operator_ids: [1], account_ids: [2] }],
    })
    expect(warnings).toEqual([{ capability: 'file', operator_ids: [1], account_ids: [2] }])
  })

  it('reads a response carrying none as none', () => {
    expect(warningsFromResponse({ id: 3 })).toEqual([])
    expect(warningsFromResponse(null)).toEqual([])
    expect(warningsFromResponse({ warnings: 'no' })).toEqual([])
  })

  it('drops an entry naming a capability it does not know', () => {
    expect(warningsFromResponse({ warnings: [{ capability: 'teleport', operator_ids: [], account_ids: [] }] })).toEqual(
      [],
    )
  })
})

describe('describeWarnings (d-x198jell)', () => {
  it('names the Accounts and what they cannot carry', () => {
    expect(describeWarnings([{ capability: 'file', operator_ids: [1], account_ids: [2] }], [GMAIL, IMAP])).toBe(
      'mail@example.net cannot file a Message into a folder',
    )
  })

  it('names an Account it has not loaded by its id rather than dropping it', () => {
    expect(describeWarnings([{ capability: 'send_message', operator_ids: [4], account_ids: [9] }], [])).toBe(
      'account 9 cannot send mail',
    )
  })
})
