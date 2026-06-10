/**
 * A small, safe, deterministic evaluator for Rule-based Tagger `match`
 * expressions. NEVER uses `eval` / `new Function` / dynamic code — it is a
 * hand-written recursive-descent parser over a fixed grammar, evaluated against
 * a caller-supplied field-lookup callback.
 *
 * This module is dependency-free of server types: it compiles an expression to
 * an evaluator that reads field values through a {@link FieldLookup} callback
 * (`(fieldName) => string | null | undefined`, null/absent → `""`). The server
 * adapts its `MessageView` + input Tags to that callback at the call site; the
 * web tier reuses the same parser for client-side validation.
 *
 * ## Grammar (informs the rule-editor UI; see also `match-vocabulary.ts`)
 *
 * ```
 * expr        := orExpr
 * orExpr      := andExpr ( "or" andExpr )*
 * andExpr     := notExpr ( "and" notExpr )*
 * notExpr     := "not" notExpr | primary
 * primary     := "(" expr ")" | comparison
 * comparison  := field op operand
 * field       := messageField
 *              | "header" "." headerName
 *              | "thread" "." threadField
 *              | "tag" "." key
 * messageField:= "from" | "to" | "subject" | "snippet" | "body"
 *              | "from_email" | "from_domain"
 *                ( a bare identifier outside this set is a PARSE ERROR — there
 *                  is no implicit bare-header lookup )
 * headerName  := identifier | string   ( quoted form allows hyphens / special
 *                                         chars, e.g. `header."list-id"` )
 * threadField := "is_reply" | "message_count"
 * key         := identifier | string   ( quoted form allows hyphens, e.g.
 *                                         `tag."x-source"` )
 * op          := "==" | "!=" | "contains" | "startsWith" | "endsWith"
 *              | "matches"
 * operand     := string                 (double- or single-quoted)
 *              | regexLiteral            (only valid as the RHS of `matches`)
 * regexLiteral:= "/" pattern "/" flags?  (flags ⊆ {i, m, s})
 * ```
 *
 * Semantics:
 *  - All comparisons are string comparisons. A field that is `null`/absent
 *    resolves to the empty string `""` (so `from == ""` tests "no sender").
 *  - `from`/`to` are the RAW header (e.g. `Foo Bar <foo@bar.com>`). Use
 *    `contains` to match an address, or the derived `from_email` (lowercased
 *    parsed address) / `from_domain` (lowercased parsed domain) for exact
 *    address/domain matches.
 *  - `header.<name>` reads the Message header `<name>` (matched
 *    case-insensitively); an absent header resolves to `""`. Use the quoted
 *    form for names with hyphens or special chars (`header."list-id"`).
 *  - `thread.is_reply` resolves to `"yes"` / `"no"`, and
 *    `thread.message_count` to the Thread's Message count as a string (e.g.
 *    `"3"`). When the Message is not in a Thread (or thread context is absent),
 *    `thread.is_reply` → `"no"` and `thread.message_count` → `"0"`.
 *  - `tag.<key>` reads the input Tag value for `<key>` in the current Triage's
 *    scope; an absent Tag resolves to `""`.
 *  - `==`, `!=`, `contains`, `startsWith`, and `endsWith` compare
 *    case-insensitively by default (so `from contains "acme.com"` matches
 *    `Sales@ACME.com`). Authors who need case-sensitive or otherwise precise
 *    matching use `matches` with an explicit regex.
 *  - `matches` tests the field against an explicit, statically-parsed regex
 *    literal — the only place regular expressions enter, and never from
 *    arbitrary user-interpolated code. The regex is compiled once at parse
 *    time and is NOT made implicitly case-insensitive — authors add the `i`
 *    flag themselves when they want that.
 *  - `and` binds tighter than `or`; `not` binds tightest. Parentheses override.
 *
 * The wildcard (`match: "*"`) is NOT an expression — it lives in the config's
 * separate `fallback` field (see `ruleBasedTaggerConfigSchema`), so this
 * evaluator never sees `"*"`.
 *
 * ## Field-lookup keys
 *
 * The compiled evaluator invokes the {@link FieldLookup} with a canonical key:
 *  - a bare Message field name (`from`, `to`, `subject`, `snippet`, `body`,
 *    `from_email`, `from_domain`);
 *  - `header.<lowercased-name>` for `header.<name>`;
 *  - `tag.<key>` for `tag.<key>`;
 *  - `thread.is_reply` / `thread.message_count` for `thread.<field>`.
 * The adapter maps each key to a string (returning `null`/`undefined` → `""`).
 *
 * Errors: a malformed expression throws {@link MatchExpressionError} at *parse*
 * time, with the offending character position. The Rule-based Tagger parses
 * every Rule's `match` up front so a bad expression fails the Operator run
 * deterministically rather than silently never matching.
 */

import { MATCH_FIELD_PREFIXES, MATCH_MESSAGE_FIELDS, MATCH_OPERATORS } from './match-vocabulary.js'

/** Thrown for any syntactic or lexical error in a `match` expression. */
export class MatchExpressionError extends Error {
  override readonly name = 'MatchExpressionError'
}

/**
 * Reads the value of a canonical field key (see module header) for evaluation.
 * A `null`/`undefined`/absent value is treated as the empty string `""`.
 */
export type FieldLookup = (fieldName: string) => string | null | undefined

/** A parsed, reusable `match` expression. Compile once, evaluate per Message. */
export interface CompiledMatch {
  evaluate(lookup: FieldLookup): boolean
}

// --- Lexer ---

type TokenType = 'and' | 'or' | 'not' | 'lparen' | 'rparen' | 'dot' | 'op' | 'ident' | 'string' | 'regex' | 'eof'

interface Token {
  readonly type: TokenType
  readonly value: string
  /** For regex tokens: the parsed flags. */
  readonly flags?: string
  readonly pos: number
}

/** The only bare field identifiers; anything else is a parse error. Derived
 * from the shared vocabulary so the parser and editor share one source. */
const MESSAGE_FIELDS = new Set(MATCH_MESSAGE_FIELDS.map((f) => f.name))
/** The supported `thread.<field>` names, derived from the vocabulary. */
const THREAD_FIELDS = new Set(
  (MATCH_FIELD_PREFIXES.find((p) => p.prefix === 'thread')?.fields ?? []).map((f) => f.name),
)

const KEYWORDS = new Set(['and', 'or', 'not'])
/** The comparison operators, derived from the shared vocabulary. */
const COMPARISON_OPS = new Set(MATCH_OPERATORS.map((o) => o.token))

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch)
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch)
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    const ch = src[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i })
      i++
      continue
    }
    if (ch === '.') {
      tokens.push({ type: 'dot', value: ch, pos: i })
      i++
      continue
    }

    // `==` and `!=`
    if (ch === '=' || ch === '!') {
      if (src[i + 1] === '=') {
        tokens.push({ type: 'op', value: `${ch}=`, pos: i })
        i += 2
        continue
      }
      throw new MatchExpressionError(`unexpected '${ch}' at position ${i} (did you mean '${ch}='?)`)
    }

    // String literal (double or single quoted).
    if (ch === '"' || ch === "'") {
      const start = i
      const quote = ch
      i++
      let str = ''
      let closed = false
      while (i < n) {
        const c = src[i]
        if (c === '\\' && i + 1 < n) {
          const next = src[i + 1]
          str +=
            next === 'n' ? '\n'
            : next === 't' ? '\t'
            : next
          i += 2
          continue
        }
        if (c === quote) {
          closed = true
          i++
          break
        }
        str += c
        i++
      }
      if (!closed) {
        throw new MatchExpressionError(`unterminated string literal starting at position ${start}`)
      }
      tokens.push({ type: 'string', value: str, pos: start })
      continue
    }

    // Regex literal: /pattern/flags
    if (ch === '/') {
      const start = i
      i++
      let pattern = ''
      let closed = false
      while (i < n) {
        const c = src[i]
        if (c === '\\' && i + 1 < n) {
          pattern += c + src[i + 1]
          i += 2
          continue
        }
        if (c === '/') {
          closed = true
          i++
          break
        }
        pattern += c
        i++
      }
      if (!closed) {
        throw new MatchExpressionError(`unterminated regex literal starting at position ${start}`)
      }
      let flags = ''
      while (i < n && /[A-Za-z]/.test(src[i])) {
        flags += src[i]
        i++
      }
      tokens.push({ type: 'regex', value: pattern, flags, pos: start })
      continue
    }

    // Identifiers, keywords, and word-form operators.
    if (isIdentStart(ch)) {
      const start = i
      let word = ''
      while (i < n && isIdentPart(src[i])) {
        word += src[i]
        i++
      }
      if (KEYWORDS.has(word)) {
        tokens.push({ type: word as TokenType, value: word, pos: start })
      } else if (COMPARISON_OPS.has(word)) {
        tokens.push({ type: 'op', value: word, pos: start })
      } else {
        tokens.push({ type: 'ident', value: word, pos: start })
      }
      continue
    }

    throw new MatchExpressionError(`unexpected character '${ch}' at position ${i}`)
  }

  tokens.push({ type: 'eof', value: '', pos: n })
  return tokens
}

// --- AST ---

type Node = OrNode | AndNode | NotNode | ComparisonNode

interface OrNode {
  readonly kind: 'or'
  readonly left: Node
  readonly right: Node
}
interface AndNode {
  readonly kind: 'and'
  readonly left: Node
  readonly right: Node
}
interface NotNode {
  readonly kind: 'not'
  readonly operand: Node
}
interface FieldRef {
  /**
   * `message` for a known bare field, `header` for `header.<name>`, `thread`
   * for `thread.<field>`, and `tag` for `tag.<key>`. `name` is the resolved
   * field/header/thread/tag name (header names already lowercased).
   */
  readonly kind: 'message' | 'header' | 'thread' | 'tag'
  readonly name: string
}
interface ComparisonNode {
  readonly kind: 'comparison'
  readonly field: FieldRef
  readonly op: string
  readonly operand: { type: 'string'; value: string } | { type: 'regex'; re: RegExp }
}

// --- Parser (recursive descent) ---

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]
  }
  private next(): Token {
    return this.tokens[this.pos++]
  }
  private expect(type: TokenType): Token {
    const t = this.peek()
    if (t.type !== type) {
      throw new MatchExpressionError(`expected ${type} but found '${t.value || t.type}' at position ${t.pos}`)
    }
    return this.next()
  }

  parse(): Node {
    const node = this.parseOr()
    if (this.peek().type !== 'eof') {
      const t = this.peek()
      throw new MatchExpressionError(`unexpected '${t.value || t.type}' at position ${t.pos}`)
    }
    return node
  }

  private parseOr(): Node {
    let left = this.parseAnd()
    while (this.peek().type === 'or') {
      this.next()
      const right = this.parseAnd()
      left = { kind: 'or', left, right }
    }
    return left
  }

  private parseAnd(): Node {
    let left = this.parseNot()
    while (this.peek().type === 'and') {
      this.next()
      const right = this.parseNot()
      left = { kind: 'and', left, right }
    }
    return left
  }

  private parseNot(): Node {
    if (this.peek().type === 'not') {
      this.next()
      return { kind: 'not', operand: this.parseNot() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    if (this.peek().type === 'lparen') {
      this.next()
      const node = this.parseOr()
      this.expect('rparen')
      return node
    }
    return this.parseComparison()
  }

  private parseComparison(): ComparisonNode {
    const field = this.parseField()
    const opTok = this.expect('op')
    const op = opTok.value

    if (op === 'matches') {
      const reTok = this.expect('regex')
      let re: RegExp
      try {
        re = new RegExp(reTok.value, reTok.flags ?? '')
      } catch (err) {
        throw new MatchExpressionError(
          `invalid regex /${reTok.value}/ at position ${reTok.pos}: ${(err as Error).message}`,
        )
      }
      return { kind: 'comparison', field, op, operand: { type: 'regex', re } }
    }

    const operandTok = this.peek()
    if (operandTok.type !== 'string') {
      throw new MatchExpressionError(
        `operator '${op}' expects a quoted string operand, found '${
          operandTok.value || operandTok.type
        }' at position ${operandTok.pos}`,
      )
    }
    this.next()
    return {
      kind: 'comparison',
      field,
      op,
      operand: { type: 'string', value: operandTok.value },
    }
  }

  private parseField(): FieldRef {
    const head = this.expect('ident')

    if (head.value === 'header') {
      this.expect('dot')
      // Header names are matched case-insensitively; lower at parse time.
      return { kind: 'header', name: this.parseFieldName().toLowerCase() }
    }
    if (head.value === 'tag') {
      this.expect('dot')
      return { kind: 'tag', name: this.parseFieldName() }
    }
    if (head.value === 'thread') {
      this.expect('dot')
      const name = this.expect('ident').value
      if (!THREAD_FIELDS.has(name)) {
        throw new MatchExpressionError(
          `unknown thread field 'thread.${name}' at position ${head.pos} ` +
            `(known: ${[...THREAD_FIELDS].join(', ')})`,
        )
      }
      return { kind: 'thread', name }
    }

    if (!MESSAGE_FIELDS.has(head.value)) {
      throw new MatchExpressionError(
        `unknown field '${head.value}' at position ${head.pos} (known message fields: ${[...MESSAGE_FIELDS].join(', ')}; use header.<name> for a header)`,
      )
    }
    return { kind: 'message', name: head.value }
  }

  /** Reads a dotted-name segment: a bare identifier or a quoted string. */
  private parseFieldName(): string {
    const t = this.peek()
    if (t.type === 'ident' || t.type === 'string') {
      this.next()
      return t.value
    }
    throw new MatchExpressionError(
      `expected a field name (identifier or quoted string) but found '${t.value || t.type}' at position ${t.pos}`,
    )
  }
}

// --- Evaluation ---

/** The canonical lookup key for a {@link FieldRef} (see module header). */
function fieldKey(field: FieldRef): string {
  switch (field.kind) {
    case 'message':
      return field.name
    case 'header':
      return `header.${field.name}`
    case 'tag':
      return `tag.${field.name}`
    default:
      return `thread.${field.name}`
  }
}

/** Resolves a {@link FieldRef} to its string value via the lookup (absent → `""`). */
function resolveField(field: FieldRef, lookup: FieldLookup): string {
  return lookup(fieldKey(field)) ?? ''
}

function evalComparison(node: ComparisonNode, lookup: FieldLookup): boolean {
  const lhs = resolveField(node.field, lookup)
  if (node.operand.type === 'regex') {
    return node.operand.re.test(lhs)
  }
  // String operators compare case-insensitively by default; `matches`
  // (handled above) is the explicit-control escape hatch.
  const lhsLower = lhs.toLowerCase()
  const rhs = node.operand.value.toLowerCase()
  switch (node.op) {
    case '==':
      return lhsLower === rhs
    case '!=':
      return lhsLower !== rhs
    case 'contains':
      return lhsLower.includes(rhs)
    case 'startsWith':
      return lhsLower.startsWith(rhs)
    case 'endsWith':
      return lhsLower.endsWith(rhs)
    default:
      // Unreachable: parser only emits known ops.
      throw new MatchExpressionError(`unknown operator '${node.op}'`)
  }
}

function evalNode(node: Node, lookup: FieldLookup): boolean {
  switch (node.kind) {
    case 'or':
      return evalNode(node.left, lookup) || evalNode(node.right, lookup)
    case 'and':
      return evalNode(node.left, lookup) && evalNode(node.right, lookup)
    case 'not':
      return !evalNode(node.operand, lookup)
    case 'comparison':
      return evalComparison(node, lookup)
  }
}

/**
 * Parses a `match` expression into a reusable {@link CompiledMatch}. Throws
 * {@link MatchExpressionError} on any syntax error. Compilation is pure and
 * deterministic; the returned matcher holds no mutable state and reads field
 * values through the {@link FieldLookup} passed to `evaluate`.
 */
export function compileMatch(expression: string): CompiledMatch {
  const ast = new Parser(tokenize(expression)).parse()
  return {
    evaluate: (lookup) => evalNode(ast, lookup),
  }
}

/**
 * Parses a `match` expression and returns the distinct `tag.<key>` keys it
 * references — the Tag inputs the Rule reads. Used by `contractFromConfig` to
 * derive a Rule-based Tagger's declared input Tag keys (so the Pipeline orders
 * the Tagger after whatever Operator produces each referenced Tag).
 *
 * Reuses the same {@link Parser} as {@link compileMatch}; it walks the AST's
 * field references and collects those whose `kind` is `tag`. Only `tag.<key>`
 * references count — `header.<name>`, `thread.<field>`, bare Message fields, and
 * string/regex operands never contribute. Order of first appearance is
 * preserved; duplicates are removed.
 *
 * Throws {@link MatchExpressionError} on a malformed expression (consistent with
 * {@link compileMatch}); callers decide how to tolerate that.
 */
export function extractTagRefs(expression: string): string[] {
  const ast = new Parser(tokenize(expression)).parse()
  const keys: string[] = []
  const seen = new Set<string>()
  const walk = (node: Node): void => {
    switch (node.kind) {
      case 'or':
      case 'and':
        walk(node.left)
        walk(node.right)
        return
      case 'not':
        walk(node.operand)
        return
      case 'comparison':
        if (node.field.kind === 'tag' && !seen.has(node.field.name)) {
          seen.add(node.field.name)
          keys.push(node.field.name)
        }
        return
    }
  }
  walk(ast)
  return keys
}
