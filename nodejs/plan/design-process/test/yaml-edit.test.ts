import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { appendItem, blockScalar, removeItem, setField, setPlainField } from '../src/yaml-edit.js'

interface Entry {
  id: string
  title?: string
  statement?: string
  status?: string
  rejection_reason?: string
}

const parse = (source: string): { version?: string; decisions?: Entry[]; requirements?: Entry[]; key?: string } =>
  parseYaml(source) as { version?: string; decisions?: Entry[]; requirements?: Entry[]; key?: string }

const decisions = (source: string): Entry[] => parse(source).decisions ?? []

/** Text an owner could type at the terminal, every character of it a yaml indicator somewhere. */
const NASTY = [
  'plain prose',
  'a colon: in the middle',
  '- a leading dash',
  '# a leading hash',
  '"quoted from the start"',
  "'single quoted'",
  '@reserved and `backticks` and {braces} and [brackets]',
  'a very '.repeat(60).trim(),
  'one paragraph\n\nand a second paragraph after a blank line',
  'a line\nfollowed by another line',
  '  a line that begins with whitespace',
  'a line that ends with whitespace   \nand a second',
  'trailing newline\n',
  'two trailing newlines\n\n',
  'a—dash and an ellipsis…',
  'https://example.test/a?b=c#d',
]

const SOURCE = `version: "2"
decisions:
  - id: d-aaaaaaaa
    title: the first entry
    statement: >
      a statement the sitting never touched, wrapped

      across two paragraphs.
    status: proposed
    because:
      - r-11111111
      - r-22222222
    pinned: false

  - id: d-bbbbbbbb
    title: the second entry
    statement: |
      a literal statement
        with an indented line
    status: proposed
    rejection_reason: a reason an earlier sitting wrote
`

describe('block scalars round-trip what the owner typed', () => {
  for (const value of NASTY) {
    it(`round-trips ${JSON.stringify(value.slice(0, 40))}`, () => {
      const source = `key: ${blockScalar(value, 0)}`
      expect(parse(source)).toEqual({ key: value })
    })
  }

  it('writes prose as a block scalar whatever its length', () => {
    expect(blockScalar('short', 0).startsWith('>')).toBe(true)
  })

  it('folds a single paragraph and wraps it, so the wrapping is not part of the value', () => {
    const value = 'a word '.repeat(40).trim()
    const rendered = blockScalar(value, 4)
    expect(rendered.startsWith('>')).toBe(true)
    expect(rendered.split('\n').length).toBeGreaterThan(3)
    expect(parse(`key: ${rendered}`)).toEqual({ key: value })
  })

  it('writes a literal block where folding would not give the value back', () => {
    expect(blockScalar('a line\nand another', 0).startsWith('|')).toBe(true)
  })
})

describe('an edit touches the spans it ruled and nothing else', () => {
  it('sets a status without reflowing the entries it did not touch', () => {
    const edited = setPlainField(SOURCE, 'decisions', 'd-aaaaaaaa', 'status', 'accepted')
    expect(edited).toContain('    status: accepted\n')
    // every other byte where it was found: the diff is the one line
    const before = SOURCE.split('\n')
    const after = edited.split('\n')
    expect(after.filter((line, index) => line !== before[index])).toEqual(['    status: accepted'])
  })

  it('adds a field the entry does not carry, and removes one it does', () => {
    const rejected = setField(
      setPlainField(SOURCE, 'decisions', 'd-aaaaaaaa', 'status', 'rejected'),
      'decisions',
      'd-aaaaaaaa',
      'rejection_reason',
      'the header should not count drafts: a survey makes that count',
    )
    expect(decisions(rejected)[0]).toMatchObject({
      status: 'rejected',
      rejection_reason: 'the header should not count drafts: a survey makes that count',
    })
    expect(decisions(rejected)[1]).toEqual(decisions(SOURCE)[1])

    const cleared = setField(rejected, 'decisions', 'd-bbbbbbbb', 'rejection_reason', undefined)
    expect(decisions(cleared)[1].rejection_reason).toBeUndefined()
    expect(decisions(cleared)[1].status).toBe('proposed')
  })

  it('keeps the blank line between entries when a field is added', () => {
    const edited = setField(SOURCE, 'decisions', 'd-aaaaaaaa', 'rejection_reason', 'because')
    expect(edited).toContain('\n\n  - id: d-bbbbbbbb')
  })

  it('removes one item, and the list itself where it held nothing else', () => {
    const one = removeItem(SOURCE, 'decisions', 'd-aaaaaaaa')
    expect(decisions(one).map((entry) => entry.id)).toEqual(['d-bbbbbbbb'])
    expect(removeItem(one, 'decisions', 'd-bbbbbbbb').trim()).toBe('version: "2"')
  })

  it('appends an item, and creates the list where the source lacks it', () => {
    const appended = appendItem(SOURCE, 'decisions', [
      { key: 'id', value: 'd-cccccccc', plain: true },
      { key: 'title', value: 'a routed answer' },
      { key: 'statement', value: 'what the owner typed: verbatim' },
      { key: 'status', value: 'accepted', plain: true },
    ])
    expect(decisions(appended).at(-1)).toEqual({
      id: 'd-cccccccc',
      title: 'a routed answer',
      statement: 'what the owner typed: verbatim',
      status: 'accepted',
    })
    expect(appended.startsWith(SOURCE.slice(0, 200))).toBe(true)

    const made = appendItem('version: "1"\n', 'requirements', [
      { key: 'id', value: 'r-cccccccc', plain: true },
      { key: 'statement', value: 'the owner’s answer' },
    ])
    expect(parse(made)).toEqual({ version: '1', requirements: [{ id: 'r-cccccccc', statement: 'the owner’s answer' }] })
  })
})
