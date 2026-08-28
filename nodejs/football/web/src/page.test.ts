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

  it('renders fixture data: news column dot, Rm Δ arrow band, and the full threat attribution tooltip', async () => {
    const row = {
      playerId: 'p-bowers',
      name: 'Brock Bowers',
      position: 'TE',
      team: 'LV',
      byeWeek: 8,
      points: 200.4,
      vor: 50.2,
      tier: 1,
      ecrRank: 10,
      adp: 61,
      roomAdp: 94,
      roomDelta: 33,
      upsideScore: 55,
      residualSpread: null,
      contested: false,
      sourceCount: 2,
      banned: false,
      injuryStatus: 'ACTIVE',
      pNextPick: 0.14,
      pPickAfter: 0.05,
      news: { playerId: 'p-bowers', direction: 'harms', impact: 'high', itemCount: 3, assessedCount: 2 },
      threat: {
        survivalToMyPick: 0.14,
        pTakenBeforeMyPick: 0.86,
        threatLevel: 3,
        attribution: {
          teamId: 11,
          slot: 4,
          ownerName: 'James Johnson',
          atPick: 21,
          probability: 0.25,
          evidence: ["TE early both years — Bowers R2 '25, Kelce R4 '24"],
        },
      },
    }
    const payloads: Record<string, unknown> = {
      '/api/state': {
        version: 1,
        league: { name: 'Fixture', size: 12, myTeamId: 13, mySlot: 11, totalRounds: 14, totalPicks: 168 },
        draft: {
          pickCount: 20,
          polledCount: 0,
          manualCount: 0,
          currentOverall: 21,
          complete: false,
          onClockTeamId: 11,
          myNextPicks: [35, 38],
          picksUntilMyTurn: 14,
        },
        picks: [],
        myRoster: { slots: [], byeCollisions: [], openStarters: 0, totalOpen: 0 },
        capture: { ratio: 0.1, teamTotal: 1300, benchmarks: { ceiling: 2000, replacement: 1200 } },
        overrides: { file: null, count: 0, boosted: 0, banned: 0, error: null },
        ingest: { running: false, startedAt: null, finishedAt: null, lastError: null, lastSummary: null },
        mock: {
          active: false,
          seed: null,
          pace: null,
          pickCount: 0,
          myTurn: false,
          countdownStartedAt: null,
          recap: null,
        },
        asOf: { player: null, seasonProjection: null, marketData: null, leagueSettings: null, draftPick: null },
        poll: {
          enabled: false,
          inFlight: false,
          intervalMs: 5000,
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastError: null,
          consecutiveFailures: 0,
          nextDelayMs: 5000,
        },
      },
      '/api/board': {
        version: 1,
        currentOverall: 21,
        myNextPicks: [35, 38],
        threatPick: 35,
        replacement: { rank: {}, points: {} },
        benchmarks: { ceiling: 2000, replacement: 1200 },
        captureRatio: 0.1,
        boostedIds: [],
        scarcity: [],
        costOfWaiting: [],
        rows: [row],
        drafted: [],
      },
      '/api/evaluate': {
        version: 1,
        currentOverall: 21,
        onClockTeamId: 11,
        myTurn: false,
        myNextPicks: [35, 38],
        candidates: [],
      },
    }
    loadMarkup()
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(payloads[path] ?? { error: 'no fixture: ' + path }) }),
      ),
    )
    vi.stubGlobal(
      'setInterval',
      vi.fn(() => 0),
    )
    try {
      // Deliberate: the page's inline script must run as-is against the served markup.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      new Function(script)()
      await new Promise((resolve) => setTimeout(resolve, 25))

      const cells = document.querySelectorAll('#rows tr td')
      expect(cells.length).toBe(document.querySelectorAll('#tscroll thead th').length)
      // N column: its own cell (second), dot clickable into the drawer
      const newsCell = cells[1] as HTMLElement
      expect(newsCell.querySelector('.pname .ndot.nd-harms.nd-high')).not.toBeNull()
      expect(cells[2]?.textContent).toContain('Brock Bowers')
      // Rm Δ: banded arrows with the real numbers in the tooltip
      const rm = document.querySelector('#rows td.rm') as HTMLElement
      expect(rm.textContent).toBe('▲▲')
      expect(rm.className).toContain('rm2up')
      expect(rm.title).toBe('ESPN 94 · market 61 — room takes him ~33 picks later than market')
      // Threat marker: the ACTUAL tooltip carries the full attribution line
      const thr = document.querySelector('#rows .thr') as HTMLElement
      expect(thr.textContent).toBe('!!!')
      expect(thr.title).toBe(
        "86% gone before your pick 35 — James Johnson (T11, slot 4) @ pick 21: 25% — TE early both years — Bowers R2 '25, Kelce R4 '24",
      )
    } finally {
      vi.unstubAllGlobals()
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
