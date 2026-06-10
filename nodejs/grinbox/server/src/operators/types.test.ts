import { describe, expect, it } from 'vitest'
import type { MessagesTable } from '../db/schema.js'
import { messageViewFromRow, parseAddress } from './types.js'

describe('parseAddress', () => {
  it('parses the display-name form (Display Name <addr@dom>)', () => {
    expect(parseAddress('Foo Bar <foo@bar.com>')).toEqual({
      email: 'foo@bar.com',
      domain: 'bar.com',
    })
  })

  it('parses a bare address', () => {
    expect(parseAddress('foo@bar.com')).toEqual({
      email: 'foo@bar.com',
      domain: 'bar.com',
    })
  })

  it('lowercases the parsed address and domain', () => {
    expect(parseAddress('Foo Bar <Foo@BAR.COM>')).toEqual({
      email: 'foo@bar.com',
      domain: 'bar.com',
    })
  })

  it('returns empty strings for missing / empty input', () => {
    expect(parseAddress(null)).toEqual({ email: '', domain: '' })
    expect(parseAddress(undefined)).toEqual({ email: '', domain: '' })
    expect(parseAddress('')).toEqual({ email: '', domain: '' })
  })

  it('returns empty strings for a malformed (address-less) header', () => {
    expect(parseAddress('Foo Bar')).toEqual({ email: '', domain: '' })
    expect(parseAddress('not an address')).toEqual({ email: '', domain: '' })
  })

  it('takes the first address when several are present', () => {
    expect(parseAddress('first@a.com, second@b.com')).toEqual({
      email: 'first@a.com',
      domain: 'a.com',
    })
    expect(parseAddress('First <first@a.com>, Second <second@b.com>')).toEqual({
      email: 'first@a.com',
      domain: 'a.com',
    })
  })

  it('yields an empty domain for an address with no domain part', () => {
    expect(parseAddress('foo@')).toEqual({ email: '', domain: '' })
  })
})

function row(over: Partial<MessagesTable> = {}): MessagesTable {
  return {
    id: 1 as unknown as MessagesTable['id'],
    account_id: 1,
    backend_message_id: 'm1',
    backend_thread_id: null,
    from_header: 'Alice <alice@example.com>',
    to_header: 'me@example.com',
    subject: 'hi',
    snippet: null,
    body_text: null,
    body_html: null,
    received_at: null,
    created_at: 0 as unknown as MessagesTable['created_at'],
    body_fetched_at: null,
    headers_json: null,
    source_state: 'present' as unknown as MessagesTable['source_state'],
    source_state_at: null,
    source_synced_at: null,
    ...over,
  }
}

describe('messageViewFromRow derived sender fields', () => {
  it('keeps `from` as the raw header and derives from_email / from_domain', () => {
    const view = messageViewFromRow(row({ from_header: 'Alice <alice@EXAMPLE.com>' }))
    expect(view.from).toBe('Alice <alice@EXAMPLE.com>')
    expect(view.from_email).toBe('alice@example.com')
    expect(view.from_domain).toBe('example.com')
  })

  it('derives empty strings from an unparseable / null from header', () => {
    expect(messageViewFromRow(row({ from_header: null })).from_email).toBe('')
    expect(messageViewFromRow(row({ from_header: 'no address here' }))).toMatchObject({
      from_email: '',
      from_domain: '',
    })
  })
})
