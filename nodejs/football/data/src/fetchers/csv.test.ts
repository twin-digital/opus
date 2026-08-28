import { describe, expect, it } from 'vitest'

import { parseCsv, parseCsvRecords } from './csv.js'

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas, quotes, and newlines', () => {
    expect(parseCsv('name,note\n"Smith, John","said ""hi""\nand left"')).toEqual([
      ['name', 'note'],
      ['Smith, John', 'said "hi"\nand left'],
    ])
  })

  it('handles CRLF line endings and empty fields', () => {
    expect(parseCsv('a,b\r\n,2\r\n')).toEqual([
      ['a', 'b'],
      ['', '2'],
    ])
  })
})

describe('parseCsvRecords', () => {
  it('keys rows by the header', () => {
    expect(parseCsvRecords('id,name\n1,Gibbs\n2,Chase')).toEqual([
      { id: '1', name: 'Gibbs' },
      { id: '2', name: 'Chase' },
    ])
  })

  it('fills missing trailing cells with empty strings', () => {
    expect(parseCsvRecords('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }])
  })
})
