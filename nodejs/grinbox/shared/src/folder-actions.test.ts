import { describe, expect, it } from 'vitest'
import { contractFromConfig, operatorConsumesBody, operatorTypeKeySchema, RESOURCE_OPERATIONS } from './index.js'
import { fileConfigSchema, setAsideConfigSchema } from './operators.js'

// --- a file action (d-jj2mymbi) ------------------------------------------

describe('fileConfigSchema', () => {
  it('names its folder literally', () => {
    const parsed = fileConfigSchema.safeParse({ folder: 'Receipts' })
    expect(parsed.success).toBe(true)
  })

  it('takes the same gate every Operator type takes', () => {
    expect(
      fileConfigSchema.safeParse({ folder: 'Receipts', when: { tag_key: 'kind', equals: ['receipt'] } }).success,
    ).toBe(true)
  })

  it('requires a folder', () => {
    expect(fileConfigSchema.safeParse({}).success).toBe(false)
    expect(fileConfigSchema.safeParse({ folder: '' }).success).toBe(false)
  })

  it('declares the filing operation, which the mailbox Resource carries', () => {
    expect(RESOURCE_OPERATIONS.mailbox).toContain('file')
    expect(contractFromConfig('file', { folder: 'Receipts' }).resources).toEqual([
      { resource: 'mailbox', operations: ['file'] },
    ])
  })

  it('reads no Tag but the gate, and never the body', () => {
    const contract = contractFromConfig('file', { folder: 'Receipts', when: { tag_key: 'kind', equals: ['receipt'] } })
    expect(contract.inputs).toEqual(['kind'])
    expect(contract.outputs).toEqual([])
    expect(operatorConsumesBody('file', { folder: 'Receipts' })).toBe(false)
  })
})

// --- a set-aside action (d-hj9nac5f, r-blqzjemx) --------------------------

describe('setAsideConfigSchema', () => {
  it('carries both a category and a folder', () => {
    expect(setAsideConfigSchema.safeParse({ category_template: 'Grinbox/Later', folder: 'Later' }).success).toBe(true)
  })

  it('requires both — one configuration serves either kind of Account', () => {
    expect(setAsideConfigSchema.safeParse({ category_template: 'Grinbox/Later' }).success).toBe(false)
    expect(setAsideConfigSchema.safeParse({ folder: 'Later' }).success).toBe(false)
  })

  it('declares both operations, so both are reachable', () => {
    expect(contractFromConfig('set_aside', { category_template: 'Grinbox/Later', folder: 'Later' }).resources).toEqual([
      { resource: 'mailbox', operations: ['apply_category', 'file'] },
    ])
  })

  it('reads the Tags its category template names, and the body where it names it', () => {
    const contract = contractFromConfig('set_aside', {
      category_template: 'Grinbox/{{tag.urgency}}',
      folder: 'Later',
      when: { tag_key: 'kind', equals: ['newsletter'] },
    })
    expect(contract.inputs).toEqual(['kind', 'urgency'])
    expect(operatorConsumesBody('set_aside', { category_template: 'Grinbox/{{body}}', folder: 'Later' })).toBe(true)
    expect(operatorConsumesBody('set_aside', { category_template: 'Grinbox/Later', folder: 'Later' })).toBe(false)
  })
})

describe('the operator type set', () => {
  it('is closed, and holds the two folder actions', () => {
    expect(operatorTypeKeySchema.options).toContain('file')
    expect(operatorTypeKeySchema.options).toContain('set_aside')
  })
})
