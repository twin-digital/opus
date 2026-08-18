import { describe, expect, it } from 'vitest'
import { unsupportedReason } from '../account-capabilities.js'
import { admitsKeywords, hasSafeMove, imapCapabilities } from './imap-capabilities.js'

const DOVECOT = ['IMAP4rev1', 'MOVE', 'UIDPLUS', 'SPECIAL-USE', 'IDLE']
const KEYWORD_FLAGS = ['\\Seen', '\\Answered', '$Forwarded', '\\*']

describe('admitsKeywords (f-9z8o6n1l)', () => {
  it('reads the special flag as the admission', () => {
    expect(admitsKeywords(KEYWORD_FLAGS)).toBe(true)
  })

  it('reads a flag list without it as no admission', () => {
    expect(admitsKeywords(['\\Seen', '\\Answered', '$Forwarded'])).toBe(false)
  })
})

describe('hasSafeMove (f-yawjn42g, f-np5bnzew)', () => {
  it('takes MOVE', () => {
    expect(hasSafeMove(['IMAP4rev1', 'MOVE'])).toBe(true)
  })

  it('takes UIDPLUS', () => {
    expect(hasSafeMove(['IMAP4rev1', 'UIDPLUS'])).toBe(true)
  })

  it('takes neither', () => {
    expect(hasSafeMove(['IMAP4rev1', 'IDLE'])).toBe(false)
  })
})

describe('imapCapabilities (d-bzw8qoiy)', () => {
  it('declares category, archive, and file on a server offering all three', () => {
    const declared = imapCapabilities(DOVECOT, KEYWORD_FLAGS, 100)
    expect([...declared.supported].sort()).toEqual(['apply_category', 'archive', 'file'])
    expect(declared.readAt).toBe(100)
  })

  it('never declares sending (d-5h66e3zl)', () => {
    const declared = imapCapabilities(DOVECOT, KEYWORD_FLAGS, 100)
    expect(declared.supported).not.toContain('send_message')
    expect(unsupportedReason(declared, 'send_message')).toMatch(/does not send/)
  })

  it('declares it cannot apply categories where the arrival folder admits none (d-bl5oamiz)', () => {
    const declared = imapCapabilities(DOVECOT, ['\\Seen'], 100)
    expect(declared.supported).not.toContain('apply_category')
    expect(unsupportedReason(declared, 'apply_category')).toMatch(/would not last/)
  })

  it('declares it can neither archive nor file without a safe move (d-8am29x25)', () => {
    const declared = imapCapabilities(['IMAP4rev1'], KEYWORD_FLAGS, 100)
    expect(declared.supported).toEqual(['apply_category'])
    expect(unsupportedReason(declared, 'archive')).toMatch(/MOVE nor UIDPLUS/)
    expect(unsupportedReason(declared, 'file')).toMatch(/MOVE nor UIDPLUS/)
  })
})
