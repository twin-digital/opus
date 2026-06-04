import { describe, it, expect } from 'vitest'

import { updateSection } from './update-section.js'

const begin = '<!-- BEGIN demo -->'
const end = '<!-- END demo -->'

describe('updateSection', () => {
  it('replaces the content between existing markers', async () => {
    const markdown = `# Title\n\n${begin}\nold content\n${end}\n\ntrailer\n`

    const result = await updateSection({ content: 'new content', markdown, sectionId: 'demo' })

    expect(result).toContain(`${begin}\n\nnew content\n\n${end}`)
    expect(result).not.toContain('old content')
    // text outside the markers is untouched
    expect(result).toContain('# Title')
    expect(result).toContain('trailer')
  })

  it('replaces every occurrence when markers appear more than once', async () => {
    const markdown = `${begin}\na\n${end}\n\nmiddle\n\n${begin}\nb\n${end}\n`

    const result = await updateSection({ content: 'X', markdown, sectionId: 'demo' })

    expect(result.match(/X/g)).toHaveLength(2)
    expect(result).not.toContain('\na\n')
    expect(result).not.toContain('\nb\n')
  })

  it('appends the section and markers when missing and missing=insert (default)', async () => {
    const markdown = '# Title\n'

    const result = await updateSection({ content: 'fresh', markdown, sectionId: 'demo' })

    expect(result).toContain(begin)
    expect(result).toContain(end)
    expect(result).toContain('fresh')
    expect(result.startsWith('# Title')).toBe(true)
  })

  it('returns markdown unchanged when missing=skip', async () => {
    const markdown = '# Title\n'

    const result = await updateSection({ content: 'fresh', markdown, missing: 'skip', sectionId: 'demo' })

    expect(result).toBe(markdown)
  })

  it('throws when missing=error and the section is absent', () => {
    // NB: despite the Promise return type, this path throws synchronously (the work is evaluated
    // eagerly as the argument to Promise.resolve), so assert a sync throw rather than a rejection.
    expect(() =>
      updateSection({ content: 'fresh', markdown: '# Title\n', missing: 'error', sectionId: 'demo' }),
    ).toThrow(/Could not find section/)
  })

  it('escapes regex-special characters in the section id', async () => {
    const id = 'repo-kit: PACKAGES (v2)'
    const b = `<!-- BEGIN ${id} -->`
    const e = `<!-- END ${id} -->`
    const markdown = `${b}\nold\n${e}\n`

    const result = await updateSection({ content: 'new', markdown, sectionId: id })

    expect(result).toContain(`${b}\n\nnew\n\n${e}`)
    expect(result).not.toContain('old')
  })
})
