import { describe, expect, it } from 'vitest'
import { type FieldLookup, MatchExpressionError, compileMatch, extractTagRefs } from './match-expression.js'

/**
 * The shared parser reads field values through a {@link FieldLookup} callback
 * (canonical key → string | null | undefined). These tests exercise the parser
 * and evaluator directly against a plain map, decoupled from any server type.
 */
function lookupFrom(fields: Record<string, string>): FieldLookup {
  return (key) => fields[key]
}

const defaults: Record<string, string> = {
  from: 'alice@example.com',
  to: 'me@example.com',
  subject: 'Invoice #42 due',
  snippet: 'please pay',
  body: 'body here',
  from_email: 'alice@example.com',
  from_domain: 'example.com',
  'header.list-id': 'news.example.com',
  'thread.is_reply': 'no',
  'thread.message_count': '0',
}

function evalExpr(expr: string, over: Record<string, string> = {}): boolean {
  return compileMatch(expr).evaluate(lookupFrom({ ...defaults, ...over }))
}

describe('match-expression operators', () => {
  it('== exact equality', () => {
    expect(evalExpr('from == "alice@example.com"')).toBe(true)
    expect(evalExpr('from == "bob@example.com"')).toBe(false)
  })

  it('!= inequality', () => {
    expect(evalExpr('from != "bob@example.com"')).toBe(true)
    expect(evalExpr('from != "alice@example.com"')).toBe(false)
  })

  it('contains', () => {
    expect(evalExpr('subject contains "Invoice"')).toBe(true)
    expect(evalExpr('subject contains "Receipt"')).toBe(false)
  })

  it('startsWith / endsWith', () => {
    expect(evalExpr('subject startsWith "Invoice"')).toBe(true)
    expect(evalExpr('subject endsWith "due"')).toBe(true)
    expect(evalExpr('subject startsWith "due"')).toBe(false)
  })

  it('matches an explicit regex literal', () => {
    expect(evalExpr('subject matches /invoice #\\d+/i')).toBe(true)
    expect(evalExpr('subject matches /^Receipt/')).toBe(false)
  })

  it('matches respects explicit flags without implicit case-insensitivity', () => {
    expect(evalExpr('subject matches /invoice/')).toBe(false)
    expect(evalExpr('subject matches /invoice/i')).toBe(true)
    expect(evalExpr('subject matches /Invoice/')).toBe(true)
  })

  it('reads tag.<key> from the lookup', () => {
    expect(evalExpr('tag.urgency == "high"', { 'tag.urgency': 'high' })).toBe(true)
    expect(evalExpr('tag.urgency == "high"', { 'tag.urgency': 'low' })).toBe(false)
  })

  it('resolves an absent field/tag to the empty string', () => {
    expect(evalExpr('snippet == ""', { snippet: '' })).toBe(true)
    expect(evalExpr('tag.missing == ""')).toBe(true)
  })

  it('reads the derived from_email / from_domain fields', () => {
    expect(evalExpr('from_email == "alice@example.com"')).toBe(true)
    expect(evalExpr('from_domain == "example.com"')).toBe(true)
  })

  it('string operators compare case-insensitively', () => {
    expect(evalExpr('from == "ALICE@example.com"', { from: 'alice@EXAMPLE.com' })).toBe(true)
    expect(evalExpr('from != "ALICE@example.com"', { from: 'alice@EXAMPLE.com' })).toBe(false)
    expect(evalExpr('from contains "acme.com"', { from: 'Sales@ACME.com' })).toBe(true)
    expect(evalExpr('subject startsWith "invoice"')).toBe(true)
    expect(evalExpr('subject endsWith "DUE"')).toBe(true)
  })

  it('reads header.<name>, including a quoted hyphenated name (lowercased key)', () => {
    expect(
      evalExpr('header.from contains "boss"', {
        'header.from': 'Boss <boss@example.com>',
      }),
    ).toBe(true)
    expect(evalExpr('header."list-id" contains "NEWS"')).toBe(true)
    expect(evalExpr('header."List-Id" == "NEWS.example.com"')).toBe(true)
    expect(evalExpr('header."x-spam-flag" == ""')).toBe(true)
  })

  it('rejects a bare unknown identifier as a parse error', () => {
    expect(() => compileMatch('subjekt contains "x"')).toThrow(MatchExpressionError)
    expect(() => compileMatch('list-id contains "news"')).toThrow(MatchExpressionError)
  })
})

describe('match-expression thread fields', () => {
  it('thread.is_reply / thread.message_count read through the lookup', () => {
    expect(evalExpr('thread.is_reply == "yes"', { 'thread.is_reply': 'yes' })).toBe(true)
    expect(evalExpr('thread.is_reply == "yes"', { 'thread.is_reply': 'no' })).toBe(false)
    expect(
      evalExpr('thread.message_count == "3"', {
        'thread.message_count': '3',
      }),
    ).toBe(true)
  })

  it('throws on an unknown thread field', () => {
    expect(() => compileMatch('thread.bogus == "x"')).toThrow(MatchExpressionError)
  })
})

describe('match-expression boolean logic + precedence', () => {
  it('and / or', () => {
    expect(evalExpr('from == "alice@example.com" and subject contains "Invoice"')).toBe(true)
    expect(evalExpr('from == "nobody" or subject contains "Invoice"')).toBe(true)
    expect(evalExpr('from == "nobody" and subject contains "Invoice"')).toBe(false)
  })

  it('not', () => {
    expect(evalExpr('not from == "bob@example.com"')).toBe(true)
    expect(evalExpr('not subject contains "Invoice"')).toBe(false)
  })

  it('and binds tighter than or', () => {
    expect(evalExpr('from == "x" and from == "y" or subject contains "Invoice"')).toBe(true)
  })

  it('parentheses override precedence', () => {
    expect(evalExpr('subject contains "Invoice" and (from == "x" or to == "me@example.com")')).toBe(true)
    expect(evalExpr('subject contains "Invoice" and (from == "x" or to == "y")')).toBe(false)
  })

  it('supports single-quoted strings', () => {
    expect(evalExpr("from == 'alice@example.com'")).toBe(true)
  })

  it('not binds tighter than and / or', () => {
    expect(evalExpr('not from == "x" and to == "nobody"')).toBe(false)
    expect(evalExpr('not subject contains "Invoice" or to == "me@example.com"')).toBe(true)
  })
})

describe('match-expression lexer edge cases', () => {
  it('decodes \\n and \\t escape sequences inside string literals', () => {
    expect(evalExpr('subject == "a\\nb"', { subject: 'a\nb' })).toBe(true)
    expect(evalExpr('subject == "a\\tb"', { subject: 'a\tb' })).toBe(true)
    expect(evalExpr('subject == "a\\qb"', { subject: 'aqb' })).toBe(true)
  })

  it('supports an escaped forward slash \\/ inside a regex literal', () => {
    expect(evalExpr('subject matches /a\\/b/', { subject: 'xx a/b yy' })).toBe(true)
    expect(evalExpr('subject matches /a\\/b/', { subject: 'a-b' })).toBe(false)
  })

  it('matches is case-sensitive by default but honors the i flag', () => {
    expect(evalExpr('subject matches /INVOICE/', { subject: 'Invoice #42' })).toBe(false)
    expect(evalExpr('subject matches /INVOICE/i', { subject: 'Invoice #42' })).toBe(true)
  })
})

describe('match-expression errors (parse-time)', () => {
  it('throws on a dangling operator', () => {
    expect(() => compileMatch('from ==')).toThrow(MatchExpressionError)
  })

  it('throws on unbalanced parentheses', () => {
    expect(() => compileMatch('(from == "a"')).toThrow(MatchExpressionError)
  })

  it('throws on an unterminated string', () => {
    expect(() => compileMatch('from == "abc')).toThrow(MatchExpressionError)
  })

  it('throws on an invalid regex literal', () => {
    expect(() => compileMatch('subject matches /(/')).toThrow(MatchExpressionError)
  })

  it('throws when matches is given a string instead of a regex', () => {
    expect(() => compileMatch('subject matches "foo"')).toThrow(MatchExpressionError)
  })

  it('throws on a bare single = ', () => {
    expect(() => compileMatch('from = "a"')).toThrow(MatchExpressionError)
  })

  it('throws on trailing garbage', () => {
    expect(() => compileMatch('from == "a" "b"')).toThrow(MatchExpressionError)
  })

  it('reports the offending character position', () => {
    expect(() => compileMatch('from == "a" "b"')).toThrow(/position/)
  })
})

describe('extractTagRefs', () => {
  it('returns a single tag.<key> reference', () => {
    expect(extractTagRefs('tag.urgency == "high"')).toEqual(['urgency'])
  })

  it('collects multiple distinct refs in first-seen order', () => {
    expect(extractTagRefs('tag.urgency == "high" or tag.kind == "alert"')).toEqual(['urgency', 'kind'])
  })

  it('dedups a key referenced more than once', () => {
    expect(extractTagRefs('tag.urgency == "high" or tag.urgency == "medium"')).toEqual(['urgency'])
  })

  it('returns [] when there are no tag refs', () => {
    expect(extractTagRefs('from contains "acme.com"')).toEqual([])
  })

  it('walks nested and/or/not', () => {
    expect(extractTagRefs('not (tag.a == "1" and (tag.b == "2" or tag.c == "3"))').sort()).toEqual(['a', 'b', 'c'])
  })

  it('finds a tag ref regardless of which operand position it occupies', () => {
    // `tag.x` is always the field (LHS); confirm it is collected even when the
    // expression mixes a non-tag comparison around it.
    expect(extractTagRefs('subject contains "x" and tag.source_type == "billing"')).toEqual(['source_type'])
  })

  it('does not mistake header./thread./message fields or string operands for tags', () => {
    expect(
      extractTagRefs(
        'header."list-id" contains "news" and thread.is_reply == "yes" ' + 'and from == "tag.fake@example.com"',
      ),
    ).toEqual([])
  })

  it('supports the quoted tag-key form', () => {
    expect(extractTagRefs('tag."x-source" == "rss"')).toEqual(['x-source'])
  })

  it('throws MatchExpressionError on a malformed expression', () => {
    expect(() => extractTagRefs('(((')).toThrow(MatchExpressionError)
  })
})
