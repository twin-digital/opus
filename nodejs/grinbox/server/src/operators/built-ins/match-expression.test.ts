import { describe, expect, it } from 'vitest'
import type { MessageView } from '../types.js'
import { type MatchContext, MatchExpressionError, buildFieldLookup, compileMatch } from './match-expression.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'm1',
    from: 'alice@example.com',
    from_email: 'alice@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'Invoice #42 due',
    snippet: 'please pay',
    bodyText: 'body here',
    bodyHtml: null,
    receivedAt: 0,
    headers: new Map([['list-id', 'news.example.com']]),
    thread: null,
    ...over,
  }
}

function ctx(msgOver: Partial<MessageView> = {}, tags: Record<string, string> = {}): MatchContext {
  return { message: message(msgOver), tags: new Map(Object.entries(tags)) }
}

function evalExpr(expr: string, msgOver: Partial<MessageView> = {}, tags: Record<string, string> = {}): boolean {
  return compileMatch(expr).evaluate(buildFieldLookup(ctx(msgOver, tags)))
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
    // subject is "Invoice #42 due": lowercase /invoice/ does NOT match without
    // an `i` flag, confirming `matches` is not made implicitly insensitive.
    expect(evalExpr('subject matches /invoice/')).toBe(false)
    expect(evalExpr('subject matches /invoice/i')).toBe(true)
    expect(evalExpr('subject matches /Invoice/')).toBe(true)
  })

  it('reads tag.<key> from input Tags', () => {
    expect(evalExpr('tag.urgency == "high"', {}, { urgency: 'high' })).toBe(true)
    expect(evalExpr('tag.urgency == "high"', {}, { urgency: 'low' })).toBe(false)
  })

  it('resolves an absent field/tag to the empty string', () => {
    expect(evalExpr('snippet == ""', { snippet: null })).toBe(true)
    expect(evalExpr('tag.missing == ""')).toBe(true)
  })

  it('string operators compare case-insensitively', () => {
    expect(
      evalExpr('from == "ALICE@example.com"', {
        from: 'alice@EXAMPLE.com',
      }),
    ).toBe(true)
    expect(
      evalExpr('from != "ALICE@example.com"', {
        from: 'alice@EXAMPLE.com',
      }),
    ).toBe(false)
    expect(evalExpr('from contains "acme.com"', { from: 'Sales@ACME.com' })).toBe(true)
    expect(evalExpr('subject startsWith "invoice"')).toBe(true)
    expect(evalExpr('subject endsWith "DUE"')).toBe(true)
  })

  it('reads header.<name>, including a quoted hyphenated name', () => {
    // bare-token header name resolves the header by (lowercased) name
    expect(
      evalExpr('header.from contains "boss"', {
        headers: new Map([['from', 'Boss <boss@example.com>']]),
      }),
    ).toBe(true)
    // quoted, hyphenated header name resolves and matches case-insensitively
    expect(evalExpr('header."list-id" contains "NEWS"')).toBe(true)
    expect(evalExpr('header."List-Id" == "NEWS.example.com"')).toBe(true)
    // absent header resolves to ""
    expect(evalExpr('header."x-spam-flag" == ""')).toBe(true)
  })

  it('reads the derived from_email / from_domain fields', () => {
    expect(
      evalExpr('from_email == "alice@example.com"', {
        from: 'Alice <alice@example.com>',
        from_email: 'alice@example.com',
        from_domain: 'example.com',
      }),
    ).toBe(true)
    expect(
      evalExpr('from_domain == "example.com"', {
        from_email: 'alice@example.com',
        from_domain: 'example.com',
      }),
    ).toBe(true)
    // Unparseable address → "" for both derived fields.
    expect(evalExpr('from_email == ""', { from_email: '', from_domain: '' })).toBe(true)
  })

  it('rejects a bare unknown identifier as a parse error', () => {
    expect(() => compileMatch('subjekt contains "x"')).toThrow(MatchExpressionError)
    expect(() => compileMatch('list-id contains "news"')).toThrow(MatchExpressionError)
  })
})

describe('match-expression thread fields', () => {
  it('thread.is_reply resolves to yes/no', () => {
    expect(
      evalExpr('thread.is_reply == "yes"', {
        thread: { backendThreadId: 't1', isReply: true, messageCount: 3 },
      }),
    ).toBe(true)
    expect(
      evalExpr('thread.is_reply == "yes"', {
        thread: { backendThreadId: 't1', isReply: false, messageCount: 1 },
      }),
    ).toBe(false)
  })

  it('thread.message_count resolves to the count as a string', () => {
    expect(
      evalExpr('thread.message_count == "3"', {
        thread: { backendThreadId: 't1', isReply: true, messageCount: 3 },
      }),
    ).toBe(true)
  })

  it('defaults to no / 0 when thread context is absent', () => {
    expect(evalExpr('thread.is_reply == "no"', { thread: null })).toBe(true)
    expect(evalExpr('thread.message_count == "0"', { thread: null })).toBe(true)
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
    // false and false or true  ==  (false and false) or true  ==  true
    expect(evalExpr('from == "x" and from == "y" or subject contains "Invoice"')).toBe(true)
  })

  it('parentheses override precedence', () => {
    // true and (false or true) == true
    expect(evalExpr('subject contains "Invoice" and (from == "x" or to == "me@example.com")')).toBe(true)
    // true and (false or false) == false
    expect(evalExpr('subject contains "Invoice" and (from == "x" or to == "y")')).toBe(false)
  })

  it('supports single-quoted strings', () => {
    expect(evalExpr("from == 'alice@example.com'")).toBe(true)
  })

  it('not binds tighter than and / or', () => {
    // The load-bearing case: `not A and B` must parse as `(not A) and B`, not
    // `not (A and B)`. With A=(from=="x")=false and B=(to=="nobody")=false:
    //   tight: (not false) and false = true and false = false  ← expected
    //   loose: not (false and false) = not false = true        ← rejected
    expect(evalExpr('not from == "x" and to == "nobody"')).toBe(false)
    // `not A or B` parses as `(not A) or B`: (not true) or true = false or true.
    expect(evalExpr('not subject contains "Invoice" or to == "me@example.com"')).toBe(true)
  })
})

describe('match-expression lexer edge cases', () => {
  it('decodes \\n and \\t escape sequences inside string literals', () => {
    // The lexer turns \n / \t into real control chars; a literal backslash-x
    // becomes just x.
    expect(evalExpr('subject == "a\\nb"', { subject: 'a\nb' })).toBe(true)
    expect(evalExpr('subject == "a\\tb"', { subject: 'a\tb' })).toBe(true)
    expect(evalExpr('subject == "a\\qb"', { subject: 'aqb' })).toBe(true)
  })

  it('supports an escaped forward slash \\/ inside a regex literal', () => {
    // `/a\/b/` must lex the `\/` as part of the pattern (not a regex
    // terminator) and match the literal "a/b".
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
})
