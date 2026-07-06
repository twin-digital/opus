import { describe, expect, it } from 'vitest'

import { INDEX_HTML } from './page.js'
import { esc, safeUrl } from './page-sanitize.js'

describe('safeUrl', () => {
  it('accepts http(s) URLs (any case)', () => {
    expect(safeUrl('https://device.sso.us-east-1.amazonaws.com/')).toBe('https://device.sso.us-east-1.amazonaws.com/')
    expect(safeUrl('http://example/')).toBe('http://example/')
    expect(safeUrl('HTTPS://EXAMPLE/')).toBe('HTTPS://EXAMPLE/')
  })

  it('rejects dangerous or non-http(s) schemes → empty string', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      ' javascript:alert(1)', // leading space: ^ anchor fails
      '\njavascript:alert(1)',
      '//evil.example',
      '/relative',
      'ftp://x/',
      '',
      null,
      undefined,
    ]) {
      expect(safeUrl(bad)).toBe('')
    }
  })
})

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<b>&"</b>')).toBe('&lt;b&gt;&amp;&quot;&lt;/b&gt;')
    expect(esc('ABCD-1234')).toBe('ABCD-1234')
    expect(esc(null)).toBe('null')
  })
})

describe('the served page', () => {
  it('embeds these exact guards (shipped === tested)', () => {
    // The page's inline script is built from esc/safeUrl via toString, so their source appears verbatim.
    expect(INDEX_HTML).toContain(safeUrl.toString())
    expect(INDEX_HTML).toContain(esc.toString())
  })
})
