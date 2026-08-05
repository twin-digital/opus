/**
 * Editing a yaml source in place: the spans a ruling touches are rewritten and every other byte
 * stays where it was found, so a submit's diff shows what the sitting did rather than a
 * re-serialisation of the whole file (d-yfxziwwg).
 *
 * Text the owner typed is written as a block scalar whatever its length, so no escaping rule has
 * to hold for the characters they can type. The scalar is folded where folding round-trips the
 * value and literal where it does not.
 */

/** Where the session wraps a folded scalar; the width and the algorithm are the implementer's. */
const WRAP_WIDTH = 100

const indentOf = (line: string): number => line.length - line.trimStart().length

const isBlank = (line: string): boolean => line.trim() === ''

/**
 * A folded block scalar reads a break between two non-empty lines back as a space, so a value
 * carrying one cannot round-trip through it. So can a line the owner began or ended with
 * whitespace, which a folded block would keep literally.
 */
const foldable = (value: string): boolean => {
  const lines = value.split('\n')
  if (lines.some((line) => /^\s/.test(line) || /\s$/.test(line))) {
    return false
  }
  return lines.every((line, index) => isBlank(line) || isBlank(lines[index + 1] ?? '') || index === lines.length - 1)
}

/** Break one paragraph at spaces; a token longer than the width stays whole, since a break inside it folds to a space. */
const wrapParagraph = (paragraph: string, width: number): string[] => {
  const rows: string[] = []
  let row = ''
  for (const token of paragraph.split(' ')) {
    if (row === '') {
      row = token
    } else if (row.length + 1 + token.length <= width) {
      row = `${row} ${token}`
    } else {
      rows.push(row)
      row = token
    }
  }
  if (row !== '') {
    rows.push(row)
  }
  return rows
}

/**
 * The lines a folded block carries for a value: each paragraph wrapped, and a run of blank lines
 * written one line longer than it is, since folding reads a run of n back as n-1 breaks.
 */
const folded = (body: string, width: number): string[] => {
  const rows: string[] = []
  const lines = body.split('\n')
  for (let at = 0; at < lines.length; at += 1) {
    if (!isBlank(lines[at])) {
      rows.push(...wrapParagraph(lines[at], width))
      continue
    }
    let run = 0
    while (at + run < lines.length && isBlank(lines[at + run])) {
      run += 1
    }
    rows.push(...Array.from({ length: run + 1 }, () => ''))
    at += run - 1
  }
  return rows
}

/**
 * The text that follows `<key>:` for a value written as a block scalar, indented under a key at
 * `indent`. The chomping indicator preserves the value's own trailing newlines exactly, and the
 * explicit indentation indicator is written where the first line would otherwise be ambiguous.
 */
export const blockScalar = (value: string, indent: number): string => {
  const bodyIndent = indent + 2
  const trailing = /\n*$/.exec(value)?.[0].length ?? 0
  const chomp =
    trailing === 0 ? '-'
    : trailing === 1 ? ''
    : '+'
  const body = value.slice(0, value.length - trailing)
  const style = foldable(body) ? '>' : '|'
  const lines = style === '>' ? folded(body, WRAP_WIDTH - bodyIndent) : body.split('\n')
  // a first line beginning with whitespace needs the indentation stated, or the parser guesses
  const indicator = /^[ \t]/.test(lines[0] ?? '') ? '2' : ''
  const pad = ' '.repeat(bodyIndent)
  const rendered = lines.map((line) => (isBlank(line) ? '' : `${pad}${line}`))
  return [`${style}${indicator}${chomp}`, ...rendered, ...Array.from({ length: Math.max(trailing - 1, 0) }, () => '')]
    .join('\n')
    .concat('\n')
}

/** The lines of the top-level block a key opens, as a half-open range. */
const blockRange = (lines: string[], key: string): [number, number] | undefined => {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`) && indentOf(line) === 0)
  if (start === -1) {
    return undefined
  }
  let end = start + 1
  while (end < lines.length && (isBlank(lines[end]) || indentOf(lines[end]) > 0)) {
    end += 1
  }
  return [start, end]
}

/** The lines a sequence item spans, and the indent its own keys sit at. */
interface Item {
  start: number
  end: number
  indent: number
}

const items = (lines: string[], [start, end]: [number, number]): Item[] => {
  const starts: number[] = []
  let indent = -1
  for (let line = start + 1; line < end; line += 1) {
    if (!/^\s*- /.test(lines[line])) {
      continue
    }
    const at = indentOf(lines[line])
    if (indent === -1) {
      indent = at
    }
    if (at === indent) {
      starts.push(line)
    }
  }
  return starts.map((at, index) => ({ start: at, end: starts[index + 1] ?? end, indent: indent + 2 }))
}

const idOf = (lines: string[], item: Item): string | undefined => {
  for (let line = item.start; line < item.end; line += 1) {
    const match = /^\s*(?:- )?id:\s*(\S+)\s*$/.exec(lines[line])
    if (match !== null && indentOf(lines[line]) + (lines[line].includes('- ') ? 2 : 0) >= item.indent) {
      return match[1]
    }
  }
  return undefined
}

const findItem = (lines: string[], listKey: string, id: string): Item | undefined => {
  const range = blockRange(lines, listKey)
  return range === undefined ? undefined : items(lines, range).find((item) => idOf(lines, item) === id)
}

/** The lines one key of an item spans, trailing blank lines excluded. */
const fieldRange = (lines: string[], item: Item, field: string): [number, number] | undefined => {
  const keys: number[] = []
  for (let line = item.start; line < item.end; line += 1) {
    const text = line === item.start ? `${' '.repeat(item.indent)}${lines[line].trimStart().slice(2)}` : lines[line]
    if (!isBlank(text) && indentOf(text) === item.indent && /^\s*[A-Za-z_][\w.-]*:/.test(text)) {
      keys.push(line)
    }
  }
  const at = keys.find((line) => {
    const text = line === item.start ? lines[line].trimStart().slice(2) : lines[line].trim()
    return text.startsWith(`${field}:`)
  })
  if (at === undefined) {
    return undefined
  }
  let end = keys.find((line) => line > at) ?? item.end
  while (end > at + 1 && isBlank(lines[end - 1])) {
    end -= 1
  }
  return [at, end]
}

/**
 * Set one field of the item `listKey` carries under `id`, writing the value as a block scalar and
 * leaving every other byte alone. A field the item does not carry is appended to it; `undefined`
 * removes one it does.
 */
export const setField = (source: string, listKey: string, id: string, field: string, value?: string): string => {
  const lines = source.split('\n')
  const item = findItem(lines, listKey, id)
  if (item === undefined) {
    return source
  }
  const existing = fieldRange(lines, item, field)
  const written =
    value === undefined ?
      []
    : `${' '.repeat(item.indent)}${field}: ${blockScalar(value, item.indent)}`.split('\n').slice(0, -1)
  if (existing === undefined) {
    if (value === undefined) {
      return source
    }
    let at = item.end
    while (at > item.start + 1 && isBlank(lines[at - 1])) {
      at -= 1
    }
    return [...lines.slice(0, at), ...written, ...lines.slice(at)].join('\n')
  }
  return [...lines.slice(0, existing[0]), ...written, ...lines.slice(existing[1])].join('\n')
}

/** Set a field to a plain scalar — a status, a name — rather than to the owner's prose. */
export const setPlainField = (source: string, listKey: string, id: string, field: string, value: string): string => {
  const lines = source.split('\n')
  const item = findItem(lines, listKey, id)
  if (item === undefined) {
    return source
  }
  const existing = fieldRange(lines, item, field)
  const written = [`${' '.repeat(item.indent)}${field}: ${value}`]
  if (existing === undefined) {
    let at = item.end
    while (at > item.start + 1 && isBlank(lines[at - 1])) {
      at -= 1
    }
    return [...lines.slice(0, at), ...written, ...lines.slice(at)].join('\n')
  }
  return [...lines.slice(0, existing[0]), ...written, ...lines.slice(existing[1])].join('\n')
}

/** Remove the item `listKey` carries under `id`, and the list itself where it held nothing else. */
export const removeItem = (source: string, listKey: string, id: string): string => {
  const lines = source.split('\n')
  const range = blockRange(lines, listKey)
  if (range === undefined) {
    return source
  }
  const all = items(lines, range)
  const item = all.find((candidate) => idOf(lines, candidate) === id)
  if (item === undefined) {
    return source
  }
  if (all.length === 1) {
    return [...lines.slice(0, range[0]), ...lines.slice(range[1])].join('\n')
  }
  return [...lines.slice(0, item.start), ...lines.slice(item.end)].join('\n')
}

/** A field of an appended item: prose is written as a block scalar, a plain value as itself. */
export interface AppendedField {
  key: string
  value: string
  plain?: boolean
}

/**
 * Append an item to the list `listKey` opens, creating the list where the source lacks it. The
 * source's own bytes are untouched; only the appended lines are new.
 */
export const appendItem = (source: string, listKey: string, fields: AppendedField[]): string => {
  const lines = source.replace(/\n+$/, '\n').split('\n')
  const range = blockRange(lines, listKey)
  const indent = 4
  const rendered = fields.flatMap((field, index) => {
    const key = index === 0 ? `  - ${field.key}:` : `${' '.repeat(indent)}${field.key}:`
    return field.plain === true ?
        [`${key} ${field.value}`]
      : `${key} ${blockScalar(field.value, indent)}`.split('\n').slice(0, -1)
  })
  if (range === undefined) {
    return `${lines.join('\n').replace(/\n*$/, '\n')}${listKey}:\n${rendered.join('\n')}\n`
  }
  let at = range[1]
  while (at > range[0] + 1 && isBlank(lines[at - 1])) {
    at -= 1
  }
  return [...lines.slice(0, at), ...rendered, ...lines.slice(at)].join('\n')
}
