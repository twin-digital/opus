import { describe, expect, it } from 'vitest'
import { InvalidKindNameError, normalizeKindName } from './cooldown-config.js'

describe('normalizeKindName (d-p8xrn2ce)', () => {
  it('trims surrounding whitespace and otherwise keeps the name as typed', () => {
    expect(normalizeKindName('  Bank alerts  ')).toBe('Bank alerts')
    expect(normalizeKindName('bank ALERTS')).toBe('bank ALERTS')
  })

  it('refuses an empty result and anything spanning more than one line', () => {
    expect(() => normalizeKindName('   ')).toThrow(InvalidKindNameError)
    expect(() => normalizeKindName('a\nb')).toThrow(InvalidKindNameError)
    expect(() => normalizeKindName('a\rb')).toThrow(InvalidKindNameError)
  })
})

// Implement-phase tests (Code wave), against the in-memory test DB:
describe('cooldown write patterns (d-k3wq81vn, d-t6mhv3aq, d-w2fzk9bd)', () => {
  it.todo(
    'createCooldown stores the trimmed kind, keyed per user and kind, and writes a change_log `created` entry naming entity_type cooldown',
  )
  it.todo('createCooldown refuses a second cooldown for the same kind (character-for-character match)')
  it.todo('editCooldown updates the interval and writes a change_log `updated` entry with before and after')
  it.todo(
    'deleteCooldown removes the row — a kind with no setting has no cooldown — and writes a change_log `deleted` entry',
  )
  it.todo(
    'the setting outlives the operators naming its kind: deleting the notify operator leaves the cooldown standing',
  )
})
