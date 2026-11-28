import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ComponentTypeDefinition } from '@thrashplay/wishem-core'
import { fieldName, propNames } from './field-names.js'

const definition = (...labels: string[]): ComponentTypeDefinition => ({
  id: 'ct_00000000-0000-4000-8000-000000000001',
  label: 'Thing',
  fields: labels.map((label, index) => ({ id: `fld_${String(index)}`, label, type: 'string' })),
})

describe('fieldName', () => {
  it('keeps a label of one word', () => {
    expect(fieldName('title')).toBe('title')
  })

  it('joins the words of a label in camel case', () => {
    expect(fieldName('Max health')).toBe('maxHealth')
  })

  it('keeps a label that has the form of a name', () => {
    expect(fieldName('maxHealth')).toBe('maxHealth')
  })

  it('divides the label at each run of characters that are not letters or digits', () => {
    expect(fieldName('  max -- health_points!')).toBe('maxHealthPoints')
  })

  it('changes only the first character of each word', () => {
    expect(fieldName('Max HEALTH')).toBe('maxHEALTH')
  })

  it('keeps each of the digits 0 to 9 in a name', () => {
    expect(fieldName('a 0 1 2 3 4 5 6 7 8 9')).toBe('a0123456789')
  })

  it('gives an empty name for a label with no letter or digit', () => {
    expect(fieldName('--- !!')).toBe('')
  })
})

describe('propNames', () => {
  it('gives one prop for each field, in the order of the definition', () => {
    const result = propNames(definition('Zeta', 'alpha', 'Mid value'))
    expect(result.props.map((prop) => prop.name)).toEqual(['zeta', 'alpha', 'midValue'])
    expect(result.props.map((prop) => prop.field.id)).toEqual(['fld_0', 'fld_1', 'fld_2'])
    expect(result.problems).toEqual([])
  })

  it('gives no prop for an empty name, and reports it', () => {
    const result = propNames(definition('title', '???'))
    expect(result.problems).toEqual([{ kind: 'empty-name', field: 'fld_1' }])
    expect(result.props.map((prop) => prop.name)).toEqual(['title'])
  })

  it('reports a name that starts with a digit', () => {
    const result = propNames(definition('2nd line'))
    expect(result.problems).toEqual([{ kind: 'name-starts-with-digit', field: 'fld_0', name: '2ndLine' }])
  })

  it('reports a reserved name, and gives no prop for the field', () => {
    const result = propNames(definition('title', 'Wishem', 'Key'))
    expect(result.problems).toEqual([
      { kind: 'reserved-name', field: 'fld_1', name: 'wishem' },
      { kind: 'reserved-name', field: 'fld_2', name: 'key' },
    ])
    expect(result.props.map((prop) => prop.name)).toEqual(['title'])
  })

  it('reports a name that starts with the digit 9', () => {
    const result = propNames(definition('9th line'))
    expect(result.problems).toEqual([{ kind: 'name-starts-with-digit', field: 'fld_0', name: '9thLine' }])
  })

  it('gives a prop for a field with a name that starts with a digit', () => {
    const result = propNames(definition('title', '2nd line'))
    expect(result.props.map((prop) => prop.name)).toEqual(['title', '2ndLine'])
  })

  it('reserves only the names wishem and key, with this case', () => {
    const result = propNames(definition('ref', 'wISHEM', 'Keys'))
    expect(result.problems).toEqual([])
    expect(result.props.map((prop) => prop.name)).toEqual(['ref', 'wISHEM', 'keys'])
  })

  it('reports a name that starts with the digit 0', () => {
    const result = propNames(definition('0th line'))
    expect(result.problems).toEqual([{ kind: 'name-starts-with-digit', field: 'fld_0', name: '0thLine' }])
  })

  it('does not report a digit after the first character of a name', () => {
    const result = propNames(definition('Line 2', 'title1'))
    expect(result.problems).toEqual([])
    expect(result.props.map((prop) => prop.name)).toEqual(['line2', 'title1'])
  })

  it('reports each empty name, and no name that two fields share', () => {
    const result = propNames(definition('???', '---'))
    expect(result.problems).toEqual([
      { kind: 'empty-name', field: 'fld_0' },
      { kind: 'empty-name', field: 'fld_1' },
    ])
    expect(result.props).toEqual([])
  })

  it('reports two labels with one name, and keeps the first field only', () => {
    const result = propNames(definition('Max health', 'other', 'max-health'))
    expect(result.problems).toEqual([{ kind: 'same-name', name: 'maxHealth', fields: ['fld_0', 'fld_2'] }])
    expect(result.props.map((prop) => prop.field.id)).toEqual(['fld_0', 'fld_1'])
  })

  it('has no relative import', () => {
    const source = readFileSync(join(import.meta.dirname, 'field-names.ts'), 'utf8')
    expect(source).not.toMatch(/(?:from|import)\s*['"]\.{1,2}\//)
  })
})
