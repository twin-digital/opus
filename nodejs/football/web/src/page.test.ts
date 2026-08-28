// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest'

import { PAGE } from './page.js'

/**
 * Structural guard for the embedded page: the markup and the inline script ship as one string,
 * so a DOM reshuffle can silently orphan the script's selectors. These tests load the real
 * markup into jsdom and check every id/selector the script uses — and execute the script once —
 * so "markup moved, script not updated" fails here instead of in the browser on draft day.
 */

const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(PAGE)
const script = scriptMatch?.[1] ?? ''

const loadMarkup = (): void => {
  const html = PAGE.replace(/^<!doctype html>\s*/i, '').replace(/<script>[\s\S]*<\/script>/, '')
  document.documentElement.innerHTML = html
}

describe('page structure', () => {
  it('embeds exactly one script', () => {
    expect(script.length).toBeGreaterThan(0)
  })

  it('keeps the embedding constraint: no backticks or dollar-brace in the page', () => {
    expect(PAGE.includes('`')).toBe(false)
    expect(PAGE.includes('${')).toBe(false)
  })

  it('ships the cost-of-waiting card and no Tier column', () => {
    expect(PAGE).toContain('Cost of waiting')
    expect(PAGE).toContain('id="waiting"')
    expect(PAGE).not.toContain('data-k="tier"')
    expect(PAGE).not.toContain('>Tier<')
    expect(PAGE).not.toContain('Tier scarcity')
  })

  it('every el() id the script references exists in the markup or in script-built markup', () => {
    const ids = new Set([...PAGE.matchAll(/id="([A-Za-z][\w-]*)"/g)].map((match) => match[1]))
    const referenced = [...script.matchAll(/\bel\('([^']+)'\)/g)].map((match) => match[1] as string)
    expect(referenced.length).toBeGreaterThan(10)
    for (const id of referenced) {
      expect(ids.has(id), `el('${id}') resolves nothing — no id="${id}" anywhere in the page`).toBe(true)
    }
  })

  it('every document.querySelector selector in the script matches the served markup', () => {
    loadMarkup()
    const selectors = [...script.matchAll(/document\.querySelector(?:All)?\('([^']+)'\)/g)].map(
      (match) => match[1] as string,
    )
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(document.querySelector(selector), `selector matches nothing: ${selector}`).not.toBeNull()
    }
  })

  it('the inline script executes against its own markup and starts polling', () => {
    loadMarkup()
    const fetchStub = vi.fn(() => new Promise<never>(() => undefined)) // pending forever — wiring only
    vi.stubGlobal('fetch', fetchStub)
    const intervalStub = vi.fn(() => 0)
    vi.stubGlobal('setInterval', intervalStub)
    try {
      expect(() => {
        // Deliberate: the page's inline script must run as-is against the served markup.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
        new Function(script)()
      }).not.toThrow()
      // the boot sequence reached its last lines: pollers registered, first state load fired
      expect(intervalStub).toHaveBeenCalled()
      expect(fetchStub).toHaveBeenCalledWith('/api/state', expect.anything())
      // delegated handlers survive a click/input without throwing
      const sortHeader = document.querySelector('#tscroll table thead th[data-k="vor"]')
      expect(sortHeader).not.toBeNull()
      sortHeader?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      document.querySelector('#tabs .tab')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const search = document.getElementById('search')
      search?.dispatchEvent(new Event('input', { bubbles: true }))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
