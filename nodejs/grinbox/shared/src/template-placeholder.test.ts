import { describe, expect, it } from 'vitest'
import { extractTemplateTagRefs } from './template-placeholder.js'

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
