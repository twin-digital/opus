import { describe, expect, it } from 'vitest'
import {
  CATEGORY_FORBIDDEN_CHARS,
  forbiddenCategoryChars,
  forbiddenCategoryTemplateChars,
  isValidCategoryName,
  sanitizeCategoryName,
} from './index.js'
import { applyCategoryConfigSchema, setAsideConfigSchema } from './operators.js'

// --- what a Category may contain (d-8v30vkou) -----------------------------

describe('isValidCategoryName', () => {
  it('accepts a name carrying none of the barred characters', () => {
    expect(isValidCategoryName('Grinbox/VIP')).toBe(true)
    expect(isValidCategoryName('needs-reply')).toBe(true)
  })

  it('rejects each barred character', () => {
    for (const char of CATEGORY_FORBIDDEN_CHARS) {
      expect(isValidCategoryName(`vip${char}`)).toBe(false)
    }
  })

  it('rejects a control character', () => {
    expect(isValidCategoryName('vip\tlater')).toBe(false)
    expect(isValidCategoryName('vip\u0000')).toBe(false)
  })

  it('rejects the empty name', () => {
    expect(isValidCategoryName('')).toBe(false)
  })
})

describe('forbiddenCategoryChars', () => {
  it('names each distinct offender once, in first-seen order', () => {
    expect(forbiddenCategoryChars('a (b) (c)')).toEqual([' ', '(', ')'])
  })

  it('escapes a control character so a refusal can print it', () => {
    expect(forbiddenCategoryChars('a\tb')).toEqual(['\\u0009'])
  })
})

// --- the template's own text, at save (d-mbh2pthe) ------------------------

describe('forbiddenCategoryTemplateChars', () => {
  it('finds nothing in a template made entirely of placeholders', () => {
    expect(forbiddenCategoryTemplateChars('{{tag.urgency}}')).toEqual([])
  })

  it('ignores what a placeholder might render — only the literal text counts', () => {
    expect(forbiddenCategoryTemplateChars('Grinbox/{{subject}}')).toEqual([])
  })

  it('finds an offender the literal text carries', () => {
    expect(forbiddenCategoryTemplateChars('Grinbox {{tag.urgency}}')).toEqual([' '])
  })
})

describe('a category template at save', () => {
  it('refuses an apply-category template whose own text carries a barred character', () => {
    const parsed = applyCategoryConfigSchema.safeParse({ category_template: 'Grinbox VIP' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain("' '")
  })

  it('accepts one whose only barred characters could come from a placeholder', () => {
    expect(applyCategoryConfigSchema.safeParse({ category_template: 'Grinbox/{{tag.urgency}}' }).success).toBe(true)
  })

  it('checks a set-aside template the same way', () => {
    expect(setAsideConfigSchema.safeParse({ category_template: 'Set Aside', folder: 'Later' }).success).toBe(false)
    expect(setAsideConfigSchema.safeParse({ category_template: 'Grinbox/Later', folder: 'Later' }).success).toBe(true)
  })
})

// --- what a rendering produces, at run (d-mbh2pthe) -----------------------

describe('sanitizeCategoryName', () => {
  it('leaves a carriable rendering as it is', () => {
    expect(sanitizeCategoryName('Grinbox/urgent')).toBe('Grinbox/urgent')
  })

  it('turns each barred character into an underscore', () => {
    expect(sanitizeCategoryName('Acme (Q3) 50%')).toBe('Acme__Q3__50_')
  })

  it('turns a control character into an underscore', () => {
    expect(sanitizeCategoryName('a\tb')).toBe('a_b')
  })

  it('leaves an empty rendering empty — there is no name to apply', () => {
    expect(sanitizeCategoryName('')).toBe('')
  })
})
