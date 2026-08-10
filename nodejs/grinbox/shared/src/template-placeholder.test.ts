import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_MESSAGE_FIELDS,
  extractTemplateTagRefs,
  extractUnknownTemplatePlaceholders,
  templateReferencesBody,
} from './template-placeholder.js'

/**
 * `extractTemplateTagRefs` derives the `{{tag.<key>}}` Tag dependencies a
 * template declares. It is the template-path analogue of the Rule-based
 * Tagger's `extractTagRefs`: only `tag.<key>` placeholders are Tag inputs;
 * bare Message-field placeholders and unknown names contribute nothing.
 */
describe('extractTemplateTagRefs', () => {
  it('returns the keys referenced as {{tag.<key>}}', () => {
    expect(extractTemplateTagRefs('{{tag.urgency}}: {{tag.category}}')).toEqual(['urgency', 'category'])
  })

  it('dedupes repeated refs, preserving first-seen order', () => {
    expect(extractTemplateTagRefs('{{tag.b}} {{tag.a}} {{tag.b}} {{tag.a}}')).toEqual(['b', 'a'])
  })

  it('ignores bare Message-field placeholders', () => {
    expect(extractTemplateTagRefs('{{from}} / {{subject}}: {{tag.urgency}}')).toEqual(['urgency'])
  })

  it('returns no keys for a template with only Message fields', () => {
    expect(extractTemplateTagRefs('{{urgency}}: {{subject}}')).toEqual([])
  })

  it('ignores unknown / non-tag names', () => {
    expect(extractTemplateTagRefs('{{bogus}} {{nope.field}}')).toEqual([])
  })

  it('tolerates whitespace inside the braces', () => {
    expect(extractTemplateTagRefs('[{{  tag.x  }}]')).toEqual(['x'])
  })

  it('returns no keys for an empty tag. ref', () => {
    expect(extractTemplateTagRefs('{{tag.}}')).toEqual([])
  })

  it('returns no keys for a plain string', () => {
    expect(extractTemplateTagRefs('no placeholders here')).toEqual([])
  })
})

/**
 * `templateReferencesBody` drives the lazy body fetch: only a `{{body}}`
 * placeholder counts — other field placeholders, `tag.` refs, and unknown
 * names that merely mention "body" do not.
 */
describe('templateReferencesBody', () => {
  it('detects a {{body}} placeholder', () => {
    expect(templateReferencesBody('classify: {{body}}')).toBe(true)
  })

  it('tolerates whitespace inside the braces', () => {
    expect(templateReferencesBody('{{  body  }}')).toBe(true)
  })

  it('is false for other field placeholders', () => {
    expect(templateReferencesBody('{{from}} {{subject}} {{snippet}}')).toBe(false)
  })

  it('is false for names that merely contain "body"', () => {
    expect(templateReferencesBody('{{Body}} {{body_html}} {{tag.body}}')).toBe(false)
  })

  it('is false for the literal word outside placeholders', () => {
    expect(templateReferencesBody('the body of the message')).toBe(false)
  })
})

/**
 * `extractUnknownTemplatePlaceholders` powers save-time rejection of names
 * the renderer would silently swallow to `""`. Known = the Message fields in
 * {@link TEMPLATE_MESSAGE_FIELDS} plus `tag.<key>` with a non-empty key.
 */
describe('extractUnknownTemplatePlaceholders', () => {
  it('accepts every renderer-known Message field', () => {
    const template = TEMPLATE_MESSAGE_FIELDS.map((f) => `{{${f}}}`).join(' ')
    expect(extractUnknownTemplatePlaceholders(template)).toEqual([])
  })

  it('accepts tag.<key> refs regardless of key', () => {
    expect(extractUnknownTemplatePlaceholders('{{tag.urgency}} {{tag.x-source}}')).toEqual([])
  })

  it('flags a case-mismatched field name', () => {
    expect(extractUnknownTemplatePlaceholders('{{Body}}')).toEqual(['Body'])
  })

  it('flags unknown bare names, deduped in first-seen order', () => {
    expect(extractUnknownTemplatePlaceholders('{{email}} {{message}} {{email}}')).toEqual(['email', 'message'])
  })

  it('flags an empty tag. ref', () => {
    expect(extractUnknownTemplatePlaceholders('{{tag.}}')).toEqual(['tag.'])
  })

  it('mixes known and unknown, reporting only the unknown', () => {
    expect(extractUnknownTemplatePlaceholders('{{subject}} {{Body}} {{tag.kind}}')).toEqual(['Body'])
  })

  it('returns nothing for a template without placeholders', () => {
    expect(extractUnknownTemplatePlaceholders('plain text')).toEqual([])
  })
})
