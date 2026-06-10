/**
 * The shared vocabulary for Rule-based Tagger `match` expressions: the single
 * source of truth for both the parser's field/operator validation (see
 * `match-expression.ts`) AND the web rule-editor's field/operator pickers.
 *
 * Keeping this descriptor in `@twin-digital/grinbox-shared` means the editor can offer
 * exactly the fields and operators the parser accepts — and surface the same
 * hint prose — without duplicating (and drifting from) the grammar. The parser
 * derives its private field/operator sets from these tables.
 */

/**
 * A bare Message field usable on the left of a comparison (e.g. `from`,
 * `subject`). `from_email` / `from_domain` are derived from the raw `From`
 * header by the server; `from` / `to` are the raw headers themselves.
 */
export interface MatchMessageField {
  /** The bare identifier used in an expression (e.g. `from`, `from_email`). */
  readonly name: string
  /** One-line picker hint describing what the field resolves to. */
  readonly hint: string
}

/**
 * A dotted field family: `header.<name>`, `tag.<key>`, `thread.<field>`. The
 * editor renders these as a prefix plus a user- or enum-supplied segment.
 */
export interface MatchFieldPrefix {
  /** The prefix keyword (`header`, `tag`, `thread`). */
  readonly prefix: string
  /** One-line picker hint describing the family. */
  readonly hint: string
  /**
   * For a closed family (`thread`), the allowed segment names. Absent for
   * open families (`header`, `tag`) whose segment is free-form.
   */
  readonly fields?: readonly MatchMessageField[]
}

/** A comparison operator plus its one-line picker hint. */
export interface MatchOperator {
  /** The operator token as written in an expression (e.g. `==`, `contains`). */
  readonly token: string
  /** One-line picker hint describing the comparison. */
  readonly hint: string
}

/**
 * The bare Message fields. `from` / `to` are the RAW header (e.g.
 * `Foo Bar <foo@bar.com>`) — use `contains` to match an address, or the parsed
 * `from_email` / `from_domain` for exact address/domain matches.
 */
export const MATCH_MESSAGE_FIELDS: readonly MatchMessageField[] = [
  {
    name: 'from',
    hint: 'Raw From header (e.g. "Foo Bar <foo@bar.com>"). Use `contains` to match an address, or `from_email` / `from_domain` for an exact match.',
  },
  {
    name: 'to',
    hint: 'Raw To header (e.g. "Foo Bar <foo@bar.com>"). Use `contains` to match an address.',
  },
  { name: 'subject', hint: 'Message subject line.' },
  { name: 'snippet', hint: 'Short provider-supplied preview snippet.' },
  { name: 'body', hint: 'Plain-text message body.' },
  {
    name: 'from_email',
    hint: 'Parsed sender email address, lowercased (e.g. "foo@bar.com"); "" if unparseable. Use for an exact-address match.',
  },
  {
    name: 'from_domain',
    hint: 'Parsed sender domain, lowercased (e.g. "bar.com"); "" if none. Use for an exact-domain match.',
  },
]

/** The dotted field families. */
export const MATCH_FIELD_PREFIXES: readonly MatchFieldPrefix[] = [
  {
    prefix: 'header',
    hint: 'A raw Message header by name, matched case-insensitively (e.g. header."list-id"); absent header → "". Quote names with hyphens/special chars.',
  },
  {
    prefix: 'tag',
    hint: 'An input Tag value by key in the current Triage scope (e.g. tag.urgency); absent Tag → "".',
  },
  {
    prefix: 'thread',
    hint: "The Message's Thread context; defaults apply when the Message is not in a Thread.",
    fields: [
      {
        name: 'is_reply',
        hint: '"yes" if the Message is a reply within its Thread, else "no" (also "no" when not in a Thread).',
      },
      {
        name: 'message_count',
        hint: 'Number of Messages in the Thread as a string (e.g. "3"); "0" when not in a Thread.',
      },
    ],
  },
]

/** The comparison operators. */
export const MATCH_OPERATORS: readonly MatchOperator[] = [
  { token: '==', hint: 'Equal (case-insensitive string comparison).' },
  { token: '!=', hint: 'Not equal (case-insensitive string comparison).' },
  {
    token: 'contains',
    hint: 'Field contains the operand (case-insensitive substring).',
  },
  {
    token: 'startsWith',
    hint: 'Field starts with the operand (case-insensitive).',
  },
  {
    token: 'endsWith',
    hint: 'Field ends with the operand (case-insensitive).',
  },
  {
    token: 'matches',
    hint: 'Field matches an explicit regex literal (e.g. /invoice/i); case-sensitive unless the `i` flag is given.',
  },
]

/**
 * The complete match vocabulary, grouped for the editor. The parser derives its
 * private field/operator sets from these tables so there is exactly one source.
 */
export const MATCH_VOCABULARY = {
  messageFields: MATCH_MESSAGE_FIELDS,
  fieldPrefixes: MATCH_FIELD_PREFIXES,
  operators: MATCH_OPERATORS,
} as const

export type MatchVocabulary = typeof MATCH_VOCABULARY
