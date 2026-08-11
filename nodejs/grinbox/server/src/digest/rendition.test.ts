import { describe, expect, it } from 'vitest'
import { escapeHtml, renderRichDigest } from './rendition.js'

describe('escapeHtml (r-8sg01qdd, d-h5ycq7rm)', () => {
  it('renders markup-significant characters as the characters they are', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(escapeHtml("Tom & Jerry's <b>")).toBe('Tom &amp; Jerry&#39;s &lt;b&gt;')
  })
})

describe('renderRichDigest (d-zkb393z9, d-7pviv01j)', () => {
  const html = renderRichDigest(
    [
      {
        title: 'Receipts <today>',
        render: 'list',
        items: [
          { text: 'Acme — $195.03 <urgent>', marked: true },
          { text: 'Other — $1.00', marked: false },
        ],
      },
      {
        title: 'Newsletters',
        render: 'count',
        count: 3,
      },
    ],
    ['2 messages in categories with no section'],
  )

  it('escapes every content string, including template-derived text', () => {
    expect(html).not.toContain('<today>')
    expect(html).toContain('Receipts &lt;today&gt;')
    expect(html).toContain('Acme — $195.03 &lt;urgent&gt;')
  })

  it('references no external asset', () => {
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<link')
    expect(html).not.toContain('@import')
  })

  it('sets no page background and no body text colour; what it colours is translucent', () => {
    expect(html).not.toMatch(/<(html|body)/)
    // Only rgba() colours appear, never an opaque color/background declaration.
    expect(html).not.toMatch(/(?<!-)color\s*:/)
    const colourings = html.match(/background-color\s*:\s*([^;]+);/g) ?? []
    for (const declaration of colourings) {
      expect(declaration).toContain('rgba(')
    }
  })

  it('styles the marked item rather than suffixing it (the text rendition suffixes)', () => {
    expect(html).toContain('rgba(255, 196, 0, 0.28)')
    expect(html).not.toContain('(!)')
  })

  // The runner-side pairing — both renditions built from one accounting and
  // carried through the send seam, money display in both — is asserted in
  // digest-runner.test.ts ('second rendition').
})
