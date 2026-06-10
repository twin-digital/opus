import { MATCH_FIELD_PREFIXES, MATCH_MESSAGE_FIELDS, MATCH_OPERATORS } from '@twin-digital/grinbox-shared'

/**
 * Bridges the Rule-based Tagger's structured field/operator/operand pickers and
 * the free-text `match` DSL string that stays the source of truth in the saved
 * config. The pickers cover the common case — a single `field op "operand"`
 * comparison — while the full grammar (`and`/`or`/`not`, parentheses, regex
 * `matches`) is only reachable through the per-rule "Advanced (free-text)"
 * escape hatch.
 *
 * Two directions:
 *  - {@link composeMatch} turns a {@link StructuredMatch} into the DSL string.
 *  - {@link parseStructuredMatch} attempts the reverse: if a `match` string is a
 *    single picker-representable comparison it returns the structured form;
 *    otherwise it returns `null` and the editor opens that rule in advanced mode
 *    (so an expression the pickers can't model is never silently mangled).
 *
 * The field/operator vocabularies are taken from `@twin-digital/grinbox-shared` so the
 * pickers offer exactly what the parser accepts.
 */

/** A picker field: either a bare message field or a dotted family + segment. */
export interface StructuredField {
  /**
   * The field selector. Bare message fields use their name (`from`, `subject`,
   * …); dotted families use the prefix (`header`, `tag`, `thread`).
   */
  readonly base: string
  /**
   * The dotted segment for `header.<name>` / `tag.<key>` (free-form) or
   * `thread.<field>` (closed list). Empty for a bare message field.
   */
  readonly segment: string
}

/** A single picker-representable comparison. */
export interface StructuredMatch {
  readonly field: StructuredField
  readonly operator: string
  readonly operand: string
}

const MESSAGE_FIELD_NAMES = new Set(MATCH_MESSAGE_FIELDS.map((f) => f.name))
const PREFIX_NAMES = new Set(MATCH_FIELD_PREFIXES.map((p) => p.prefix))
const OPERATOR_TOKENS = new Set(MATCH_OPERATORS.map((o) => o.token))
const THREAD_FIELDS = new Set(
  (MATCH_FIELD_PREFIXES.find((p) => p.prefix === 'thread')?.fields ?? []).map((f) => f.name),
)

/** True if a dotted segment is a bare identifier the DSL accepts unquoted. */
function isBareIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(s)
}

/** Quote a string operand for the DSL (double quotes, escaping `\` and `"`). */
function quoteOperand(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Render the left-hand field of a comparison as DSL source. */
function renderField(field: StructuredField): string {
  if (PREFIX_NAMES.has(field.base)) {
    const seg = field.segment
    // Header/tag names with hyphens or special chars must be quoted; thread
    // fields are a closed identifier set and never need quoting.
    const renderedSeg = isBareIdentifier(seg) ? seg : quoteOperand(seg)
    return `${field.base}.${renderedSeg}`
  }
  return field.base
}

/**
 * Compose a structured comparison into a DSL `match` string. `matches` is
 * regex-only and is never produced structurally (the editor routes `matches` to
 * advanced mode), so the operand is always emitted as a quoted string here.
 */
export function composeMatch(m: StructuredMatch): string {
  return `${renderField(m.field)} ${m.operator} ${quoteOperand(m.operand)}`
}

/** A default, blank structured match (the first message field, `contains`). */
export function blankStructuredMatch(): StructuredMatch {
  return {
    field: { base: MATCH_MESSAGE_FIELDS[0]?.name ?? 'from', segment: '' },
    operator: 'contains',
    operand: '',
  }
}

// --- Parsing a `match` string back into structured form ---

interface FieldParse {
  field: StructuredField
  /** Index in the source just past the field (start of the operator scan). */
  end: number
}

/** Reads a leading bare identifier; returns the word + the index past it. */
function readIdentifier(src: string, start: number): [string, number] | null {
  if (!/[A-Za-z_]/.test(src[start] ?? '')) {
    return null
  }
  let i = start
  let word = ''
  while (i < src.length && /[A-Za-z0-9_-]/.test(src[i])) {
    word += src[i]
    i++
  }
  return [word, i]
}

/**
 * Reads a quoted string (double or single) starting at `start` (which must be
 * the opening quote). Returns the decoded value + the index past the closing
 * quote, or `null` if unterminated.
 */
function readQuoted(src: string, start: number): [string, number] | null {
  const quote = src[start]
  if (quote !== '"' && quote !== "'") {
    return null
  }
  let i = start + 1
  let out = ''
  while (i < src.length) {
    const c = src[i]
    if (c === '\\' && i + 1 < src.length) {
      const next = src[i + 1]
      out +=
        next === 'n' ? '\n'
        : next === 't' ? '\t'
        : next
      i += 2
      continue
    }
    if (c === quote) {
      return [out, i + 1]
    }
    out += c
    i++
  }
  return null
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) {
    i++
  }
  return i
}

/** Parse the field portion at the start of `src` (after leading whitespace). */
function parseField(src: string, start: number): FieldParse | null {
  const head = readIdentifier(src, start)
  if (!head) {
    return null
  }
  const [word, afterHead] = head

  if (PREFIX_NAMES.has(word)) {
    // Dotted family: prefix "." segment.
    if (src[afterHead] !== '.') {
      return null
    }
    const segStart = afterHead + 1
    // Segment is a bare identifier or a quoted string.
    const quoted = readQuoted(src, segStart)
    if (quoted) {
      const [seg, end] = quoted
      if (word === 'thread') {
        return null
      } // thread fields are never quoted
      return { field: { base: word, segment: seg }, end }
    }
    const ident = readIdentifier(src, segStart)
    if (!ident) {
      return null
    }
    const [seg, end] = ident
    if (word === 'thread' && !THREAD_FIELDS.has(seg)) {
      return null
    }
    return { field: { base: word, segment: seg }, end }
  }

  if (MESSAGE_FIELD_NAMES.has(word)) {
    return { field: { base: word, segment: '' }, end: afterHead }
  }
  return null
}

/** Reads the operator token at `start`; returns the token + index past it. */
function readOperator(src: string, start: number): [string, number] | null {
  // Symbolic operators: == / !=
  const two = src.slice(start, start + 2)
  if (two === '==' || two === '!=') {
    return [two, start + 2]
  }
  // Word operators (contains/startsWith/endsWith/matches).
  const ident = readIdentifier(src, start)
  if (ident && OPERATOR_TOKENS.has(ident[0])) {
    return [ident[0], ident[1]]
  }
  return null
}

/**
 * Attempt to parse a `match` string as a single picker-representable
 * comparison: `field op "string-operand"`. Returns the structured form, or
 * `null` if the string is anything the pickers can't model — boolean/grouped
 * expressions, a `matches` regex, an unknown field/operator, or trailing tokens.
 * A `null` return routes the rule to advanced (free-text) mode.
 */
export function parseStructuredMatch(match: string): StructuredMatch | null {
  const trimmed = match.trim()
  if (trimmed === '') {
    return null
  }

  const fieldParse = parseField(trimmed, 0)
  if (!fieldParse) {
    return null
  }

  const afterField = skipWs(trimmed, fieldParse.end)
  const opParse = readOperator(trimmed, afterField)
  if (!opParse) {
    return null
  }
  const [op, afterOp] = opParse
  // `matches` is regex-only — not representable by the operand text input.
  if (op === 'matches') {
    return null
  }

  const afterOpWs = skipWs(trimmed, afterOp)
  const operandParse = readQuoted(trimmed, afterOpWs)
  if (!operandParse) {
    return null
  }
  const [operand, afterOperand] = operandParse

  // Anything left over (e.g. `and …`) means it's not a lone comparison.
  if (skipWs(trimmed, afterOperand) !== trimmed.length) {
    return null
  }

  return { field: fieldParse.field, operator: op, operand }
}
