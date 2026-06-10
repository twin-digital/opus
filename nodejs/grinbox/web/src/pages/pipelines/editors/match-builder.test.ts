import { describe, expect, it } from 'vitest'
import { type StructuredMatch, blankStructuredMatch, composeMatch, parseStructuredMatch } from './match-builder.js'

/**
 * The structured-pickers ↔ free-text `match` bridge. This is the load-bearing
 * correctness for "don't silently corrupt my rule": composeMatch must emit valid
 * DSL, and parseStructuredMatch must round-trip exactly the comparisons the
 * pickers can model and return null (→ advanced free-text mode) for everything
 * else, so a boolean/regex/grouped expression is never mangled into a lone
 * comparison.
 */

const m = (base: string, segment: string, operator: string, operand: string): StructuredMatch => ({
  field: { base, segment },
  operator,
  operand,
})

describe('composeMatch', () => {
  it('emits a bare-field comparison', () => {
    expect(composeMatch(m('from', '', 'contains', 'foo@bar.com'))).toBe('from contains "foo@bar.com"')
    expect(composeMatch(m('subject', '', '==', 'Invoice'))).toBe('subject == "Invoice"')
  })

  it('emits the parsed sender fields', () => {
    expect(composeMatch(m('from_email', '', '==', 'x@y.com'))).toBe('from_email == "x@y.com"')
    expect(composeMatch(m('from_domain', '', '==', 'acme.com'))).toBe('from_domain == "acme.com"')
  })

  it('leaves a bare-identifier header/tag segment unquoted (incl. hyphens)', () => {
    expect(composeMatch(m('header', 'list-id', 'contains', 'devs'))).toBe('header.list-id contains "devs"')
    expect(composeMatch(m('tag', 'category', '==', 'work'))).toBe('tag.category == "work"')
  })

  it('quotes a non-identifier header segment', () => {
    expect(composeMatch(m('header', 'X Spam Flag', '==', 'YES'))).toBe('header."X Spam Flag" == "YES"')
  })

  it('emits a thread field', () => {
    expect(composeMatch(m('thread', 'is_reply', '==', 'yes'))).toBe('thread.is_reply == "yes"')
  })

  it('escapes backslashes and double quotes in the operand', () => {
    expect(composeMatch(m('subject', '', 'contains', 'say "hi"'))).toBe('subject contains "say \\"hi\\""')
    expect(composeMatch(m('body', '', 'contains', 'a\\b'))).toBe('body contains "a\\\\b"')
  })
})

describe('parseStructuredMatch — representable comparisons', () => {
  it('parses a bare-field comparison', () => {
    expect(parseStructuredMatch('from contains "foo@bar.com"')).toEqual(m('from', '', 'contains', 'foo@bar.com'))
  })

  it('parses each operator', () => {
    for (const op of ['==', '!=', 'contains', 'startsWith', 'endsWith']) {
      expect(parseStructuredMatch(`subject ${op} "x"`)).toEqual(m('subject', '', op, 'x'))
    }
  })

  it('parses a header/tag family with a bare segment', () => {
    expect(parseStructuredMatch('header.list-id contains "devs"')).toEqual(m('header', 'list-id', 'contains', 'devs'))
    expect(parseStructuredMatch('tag.category == "work"')).toEqual(m('tag', 'category', '==', 'work'))
  })

  it('parses a quoted header segment', () => {
    expect(parseStructuredMatch('header."X Spam Flag" == "YES"')).toEqual(m('header', 'X Spam Flag', '==', 'YES'))
  })

  it('parses a closed thread field', () => {
    expect(parseStructuredMatch('thread.is_reply == "yes"')).toEqual(m('thread', 'is_reply', '==', 'yes'))
  })

  it('tolerates surrounding / extra whitespace', () => {
    expect(parseStructuredMatch('  from   ==   "a@b.com"  ')).toEqual(m('from', '', '==', 'a@b.com'))
  })
})

describe('parseStructuredMatch — null (→ advanced free-text)', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['from contains "a" and subject contains "b"', 'boolean and'],
    ['from contains "a" or to contains "b"', 'boolean or'],
    ['not (subject == "x")', 'grouped / not'],
    ['subject matches /urgent/i', 'regex matches'],
    ['bogus == "x"', 'unknown field'],
    ['subject ~ "URGENT"', 'unknown operator'],
    ['thread.unknown == "x"', 'unknown thread field'],
    ['thread."is_reply" == "yes"', 'quoted thread segment'],
    ['from contains foo', 'unquoted operand'],
    ['from contains "a" trailing', 'trailing tokens'],
    ['from', 'field only'],
    ['from contains', 'missing operand'],
  ])('returns null for %s (%s)', (input) => {
    expect(parseStructuredMatch(input)).toBeNull()
  })
})

describe('round-trip', () => {
  const cases: StructuredMatch[] = [
    m('from', '', 'contains', 'foo@bar.com'),
    m('from', '', '==', 'Foo Bar <foo@bar.com>'),
    m('from_email', '', '==', 'x@y.com'),
    m('from_domain', '', '!=', 'spam.example'),
    m('subject', '', 'startsWith', '[ALERT]'),
    m('header', 'list-id', 'contains', 'team'),
    m('header', 'X Spam Flag', '==', 'YES'),
    m('tag', 'category', '==', 'work'),
    m('thread', 'is_reply', '==', 'yes'),
    m('thread', 'message_count', '==', '1'),
    m('body', '', 'contains', 'quote " and back\\slash'),
    m('subject', '', 'contains', ''),
  ]

  it.each(cases.map((c) => [composeMatch(c), c] as const))(
    'parse(compose) is identity for %s',
    (composed, original) => {
      expect(parseStructuredMatch(composed)).toEqual(original)
    },
  )
})

describe('blankStructuredMatch', () => {
  it('defaults to the first message field with contains and empty operand', () => {
    const blank = blankStructuredMatch()
    expect(blank).toEqual(m('from', '', 'contains', ''))
    // and it composes to a parseable (if incomplete) expression
    expect(composeMatch(blank)).toBe('from contains ""')
  })
})
