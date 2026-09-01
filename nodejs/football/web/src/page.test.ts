// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest'

import { PAGE } from './page.js'

/**
 * Structural guard for the embedded page: the markup and the inline script ship as one string,
 * so a DOM reshuffle can silently orphan the script's selectors. These tests load the real
 * markup into jsdom and check every id/selector the script uses — and execute the script against
 * fixture API payloads — so "markup moved, script not updated" fails here instead of in the
 * browser on draft day.
 */

const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(PAGE)
const script = scriptMatch?.[1] ?? ''

const loadMarkup = (): void => {
  const html = PAGE.replace(/^<!doctype html>\s*/i, '').replace(/<script>[\s\S]*<\/script>/, '')
  document.documentElement.innerHTML = html
}

// -- fixture payloads ---------------------------------------------------------

const BOWERS_ROW = {
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

const boardRow = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  ...BOWERS_ROW,
  news: null,
  threat: null,
  ...overrides,
})

interface FixtureOptions {
  /** My picks already made (drives the K/DST nudge's remaining count); totalRounds is 14. */
  myPickCount?: number
  /** Open K/DST seats on my roster (capacity 1 each; filled seats get a player). */
  openK?: number
  openDst?: number
  myTurn?: boolean
  computing?: boolean
  extraRows?: Record<string, unknown>[]
  /** Unresolved-pick ESPN ids surfaced by /api/state (amber chip). */
  unresolvedEspnIds?: number[]
  /** noiseBand carried on /api/evaluate (MC evaluator's model-error band). */
  noiseBand?: number
  extraCandidates?: Record<string, unknown>[]
  /** Serve the candidate list even off my turn (WAITING falls strip, stale SIMULATING rows). */
  withCandidates?: boolean
  /** Players already seated in my starting lineup (drives the panel's bye highlights). */
  myStarters?: { name: string; position: string; byeWeek: number | null }[]
  /** Signed boost totals on /api/board (drives the direction-aware ▲/▼ marker). */
  boosts?: { playerId: string; points: number; note: string | null }[]
}

const buildPayloads = (options: FixtureOptions = {}): Record<string, unknown> => {
  const myPickCount = options.myPickCount ?? 0
  const myPicks = Array.from({ length: myPickCount }, (unused, i) => ({
    playerId: `p-mine-${String(i)}`,
    teamId: 13,
    overall: i * 12 + 11,
    round: i + 1,
    source: 'manual',
    name: `Mine ${String(i)}`,
    position: 'RB',
    team: 'DET',
  }))
  const seat = (open: number): { name: string }[] => (open === 0 ? [{ name: 'Filled Guy' }] : [])
  const rows = [BOWERS_ROW, ...(options.extraRows ?? [])]
  return {
    '/api/state': {
      version: 1,
      league: { name: 'Fixture', size: 12, myTeamId: 13, mySlot: 11, totalRounds: 14, totalPicks: 168 },
      draft: {
        pickCount: myPickCount,
        polledCount: 0,
        manualCount: myPickCount,
        currentOverall: myPickCount + 1,
        complete: false,
        onClockTeamId: options.myTurn === true ? 13 : 11,
        myNextPicks: [35, 38],
        picksUntilMyTurn: options.myTurn === true ? 0 : 14,
        unresolved: {
          count: (options.unresolvedEspnIds ?? []).length,
          espnIds: options.unresolvedEspnIds ?? [],
        },
      },
      picks: myPicks,
      myRoster: {
        slots: [
          { slot: 'RB', capacity: 2, players: [] },
          ...(options.myStarters === undefined ?
            []
          : [{ slot: 'FLEX', capacity: options.myStarters.length, players: options.myStarters }]),
          { slot: 'K', capacity: 1, players: seat(options.openK ?? 1) },
          { slot: 'DST', capacity: 1, players: seat(options.openDst ?? 1) },
        ],
        byeCollisions: [],
        openStarters: 2,
        totalOpen: 5,
      },
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
      currentOverall: myPickCount + 1,
      myNextPicks: [35, 38],
      threatPick: 35,
      replacement: { rank: {}, points: {} },
      benchmarks: { ceiling: 2000, replacement: 1200 },
      captureRatio: 0.1,
      boostedIds: (options.boosts ?? []).map((boost) => boost.playerId),
      boosts: options.boosts ?? [],
      scarcity: [],
      costOfWaiting: [],
      rows,
      drafted: [],
    },
    '/api/evaluate': {
      version: 1,
      currentOverall: myPickCount + 1,
      onClockTeamId: options.myTurn === true ? 13 : 11,
      myTurn: options.myTurn === true,
      myNextPicks: [35, 38],
      evalMode: 'mc',
      ...(options.noiseBand === undefined ? {} : { noiseBand: options.noiseBand }),
      computing: options.computing === true,
      candidates:
        options.myTurn === true || options.withCandidates === true ?
          [
            {
              playerId: 'p-bowers',
              name: 'Brock Bowers',
              position: 'TE',
              points: 200.4,
              vor: 50.2,
              estTeamScore: 1500,
              captureRatio: 0.4,
              deltaVsBest: 0,
              landsOn: 'TE',
              upsideScore: 55,
              byeWeek: 8,
              se: 0.8,
              pBest: 0.62,
              deltaVsRef: 0,
              exactTies: 1,
              tier: 1,
              ecrRank: 10,
              roomAdp: 94,
              pNextPick: 0.14,
              pPickAfter: 0.05,
              boosted: false,
              news: null,
              threat: null,
            },
            ...(options.extraCandidates ?? []),
          ]
        : [],
    },
  }
}

/** Execute the page script against stubbed API payloads; caller asserts on the DOM after. */
const runPage = async (payloads: Record<string, unknown>): Promise<void> => {
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
  // Deliberate: the page's inline script must run as-is against the served markup.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function(script)()
  await new Promise((resolve) => setTimeout(resolve, 25))
}

// -- tests --------------------------------------------------------------------

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

describe('page rendering with fixture data', () => {
  it('renders the news column dot, Rm Δ arrow band, and the full threat attribution tooltip', async () => {
    try {
      await runPage(buildPayloads())
      const cells = document.querySelectorAll('#rows tr')[0]?.querySelectorAll('td') ?? []
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

  it('shows pBest next to Δ best on the fresh on-clock table', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 2 }))
      const row = document.querySelectorAll('#clockRows tr')[0]
      const pbest = row?.querySelector('.delta .pbest')
      expect(pbest?.textContent).toBe('62%')
      expect((pbest as HTMLElement).title).toBe('wins 62% of sampled drafts')
      expect(row?.querySelector('.delta .best-tag')?.textContent).toBe('BEST')
      expect(row?.querySelector('button.act[data-act="mine"]')).not.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  describe('the always-visible clock panel states', () => {
    const panel = (): HTMLElement => document.getElementById('clockPanel') as HTMLElement
    const chip = (): HTMLElement => document.getElementById('clockState') as HTMLElement
    const table = (): HTMLElement => document.getElementById('clockTable') as HTMLElement
    const waitBody = (): HTMLElement => document.getElementById('clockWait') as HTMLElement

    it('ON THE CLOCK: violet ring, fresh table, no wait body', async () => {
      try {
        await runPage(buildPayloads({ myTurn: true, myPickCount: 2 }))
        expect(panel().style.display).not.toBe('none')
        expect(chip().textContent).toBe('YOU ARE ON THE CLOCK')
        expect(chip().className).toContain('on')
        expect(panel().className).toContain('myturn')
        expect(table().style.display).not.toBe('none')
        expect(waitBody().style.display).toBe('none')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('WAITING: muted chip, no ring, table down, pick-away line plus the falls strip', async () => {
      try {
        await runPage(buildPayloads({ myTurn: false, myPickCount: 2, withCandidates: true }))
        expect(panel().style.display).not.toBe('none')
        expect(chip().textContent).toBe('WAITING')
        expect(chip().className).toContain('wait')
        expect(panel().className).not.toContain('myturn')
        expect(table().style.display).toBe('none')
        expect((document.getElementById('clockDot') as HTMLElement).style.display).toBe('none')
        expect(waitBody().style.display).not.toBe('none')
        expect(waitBody().textContent).toContain('You pick at #35 — 32 picks away')
        expect(waitBody().textContent).toContain('IF HE FALLS TO YOU @35')
        expect(waitBody().textContent).toContain('Brock Bowers')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('SIMULATING: violet chip with elapsed timer, table down, waiting-style body', async () => {
      try {
        await runPage(buildPayloads({ myTurn: false, computing: true }))
        expect(panel().style.display).not.toBe('none')
        expect(chip().textContent).toMatch(/^SIMULATING · \d+s$/)
        expect(chip().className).toContain('sim')
        expect(panel().className).not.toContain('myturn')
        expect(table().style.display).toBe('none')
        expect(waitBody().style.display).not.toBe('none')
        expect(waitBody().textContent).toContain('You pick at #35 — 34 picks away')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('SIMULATING with candidates off my turn: falls strip shows, table stays down', async () => {
      try {
        await runPage(buildPayloads({ myTurn: false, computing: true, withCandidates: true }))
        expect(chip().textContent).toMatch(/^SIMULATING · \d+s$/)
        expect(panel().className).not.toContain('myturn')
        expect(table().style.display).toBe('none')
        expect(document.querySelectorAll('#clockRows tr').length).toBe(0)
        expect(waitBody().textContent).toContain('IF HE FALLS TO YOU @35')
        expect(waitBody().textContent).toContain('Brock Bowers')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('my turn wins while computing: table shown, computing demoted to the chip', async () => {
      try {
        await runPage(buildPayloads({ myTurn: true, myPickCount: 2, computing: true, withCandidates: true }))
        expect(chip().textContent).toMatch(/^ON THE CLOCK — SIMULATING · \d+s$/)
        expect(panel().className).toContain('myturn')
        expect(table().style.display).not.toBe('none')
        expect(document.querySelectorAll('#clockRows tr').length).toBeGreaterThan(0)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('the timer restarts when the version moves while still computing', async () => {
      const payloads = buildPayloads({ myTurn: false, computing: true }) as Record<string, { version?: number }>
      loadMarkup()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_000_000)
      vi.stubGlobal(
        'fetch',
        vi.fn((path: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(payloads[path] ?? {}) })),
      )
      const intervals: { fn: () => void; ms: number }[] = []
      vi.stubGlobal(
        'setInterval',
        vi.fn((fn: () => void, ms: number) => {
          intervals.push({ fn, ms })
          return 0
        }),
      )
      const poll = (): void => {
        intervals.find((interval) => interval.ms === 2000)?.fn()
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
        new Function(script)()
        await new Promise((resolve) => setTimeout(resolve, 25))
        expect(chip().textContent).toBe('SIMULATING · 0s')
        // Same simulation seven seconds on: the counter holds its origin.
        vi.setSystemTime(1_007_000)
        poll()
        await new Promise((resolve) => setTimeout(resolve, 25))
        expect(chip().textContent).toBe('SIMULATING · 7s')
        // A pick lands mid-compute (version bump, still computing): the counter restarts.
        ;(payloads['/api/state'] as { version: number }).version = 2
        ;(payloads['/api/evaluate'] as { version: number }).version = 2
        vi.setSystemTime(1_009_000)
        poll()
        await new Promise((resolve) => setTimeout(resolve, 25))
        expect(chip().textContent).toBe('SIMULATING · 0s')
      } finally {
        vi.useRealTimers()
        vi.unstubAllGlobals()
      }
    })
  })

  describe('the panel bye column', () => {
    const byeCells = (): HTMLElement[] =>
      [...document.querySelectorAll('#clockRows tr')].map((tr) => tr.querySelectorAll('td')[2] as HTMLElement)

    it('sits after Pos and amber-tints a pick that stacks a third skill starter on one bye', async () => {
      try {
        await runPage(
          buildPayloads({
            myTurn: true,
            myStarters: [
              { name: 'Stacked RB', position: 'RB', byeWeek: 8 },
              { name: 'Stacked WR', position: 'WR', byeWeek: 8 },
            ],
          }),
        )
        const headers = [...document.querySelectorAll('#clockPanel thead th')].map((th) => th.textContent)
        expect(headers.indexOf('Bye')).toBe(headers.indexOf('Pos') + 1)
        const cell = byeCells()[0] as HTMLElement
        expect(cell.textContent).toBe('8')
        expect(cell.className).toContain('bye-stack')
        expect(cell.title).toBe('would stack 3rd skill starter on bye week 8')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('red-tints a TE sharing his own starter TE bye — the backup that covers nothing', async () => {
      try {
        await runPage(buildPayloads({ myTurn: true, myStarters: [{ name: 'Starter TE', position: 'TE', byeWeek: 8 }] }))
        const cell = byeCells()[0] as HTMLElement
        expect(cell.className).toContain('bye-samepos')
        expect(cell.title).toContain('same bye (week 8) as your TE starter Starter TE')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('marks a positive boost green-up and a penalty amber-down with signed tooltips', async () => {
      try {
        const penalized = {
          ...BOWERS_ROW,
          playerId: 'p-penal',
          name: 'Penalized Guy',
          position: 'WR',
        }
        await runPage(
          buildPayloads({
            extraRows: [penalized],
            boosts: [
              { playerId: 'p-bowers', points: 25, note: null },
              { playerId: 'p-penal', points: -40, note: 'holdout' },
            ],
          }),
        )
        const rows = document.getElementById('rows') as HTMLElement
        const up = rows.querySelector('.mark-boost') as HTMLElement
        const down = rows.querySelector('.mark-boost-down') as HTMLElement
        expect(up.textContent).toBe('▲')
        expect(up.title).toContain('boost +25 pts')
        expect(down.textContent).toBe('▼')
        expect(down.title).toContain('boost -40 pts')
        expect(down.title).toContain('holdout')
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('stays plain when byes do not collide', async () => {
      try {
        await runPage(buildPayloads({ myTurn: true, myStarters: [{ name: 'Other RB', position: 'RB', byeWeek: 9 }] }))
        const cell = byeCells()[0] as HTMLElement
        expect(cell.textContent).toBe('8')
        expect(cell.className).toBe('')
        expect(cell.title).toBe('')
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })

  it('shows the panel ECR column on my turn, with room ADP one hover away', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 2 }))
      const headers = [...document.querySelectorAll('#clockPanel thead th')].map((th) => th.textContent)
      const ecrIndex = headers.indexOf('ECR')
      expect(ecrIndex).toBeGreaterThan(headers.indexOf('Lands'))
      expect(ecrIndex).toBeLessThan(headers.indexOf('UPS'))
      const cells = document.querySelectorAll('#clockRows tr')[0]?.querySelectorAll('td') ?? []
      expect(cells[ecrIndex]?.textContent).toBe('10')
      expect((cells[ecrIndex] as HTMLElement).title).toBe('ECR 10 · ADP 94.0')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  const kdRows = [
    boardRow({ playerId: 'p-k1', name: 'Best Kicker', position: 'K', adp: 120, points: null }),
    boardRow({ playerId: 'p-k2', name: 'Next Kicker', position: 'K', adp: 130, points: null }),
    boardRow({ playerId: 'p-d1', name: 'Best Defense', position: 'DST', adp: 118, points: null }),
  ]

  it('K/DST nudge stays hidden with slack: 6 picks left, 2 seats open', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 8, openK: 1, openDst: 1, extraRows: kdRows }))
      expect((document.getElementById('kdNudge') as HTMLElement).style.display).toBe('none')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('K/DST nudge goes amber at one pick of slack: 3 left, 2 open', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 11, openK: 1, openDst: 1, extraRows: kdRows }))
      const nudge = document.getElementById('kdNudge') as HTMLElement
      expect(nudge.style.display).not.toBe('none')
      expect(nudge.className).toContain('kd-amber')
      expect(nudge.textContent).toContain('3 picks left, K/DST still open')
      expect(nudge.querySelector('button')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('K/DST nudge goes red with one-click rows when every pick is needed: 2 left, 2 open', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 12, openK: 1, openDst: 1, extraRows: kdRows }))
      const nudge = document.getElementById('kdNudge') as HTMLElement
      expect(nudge.className).toContain('kd-red')
      expect(nudge.textContent).toContain('2 picks left, K/DST still open')
      expect(nudge.textContent).toContain('Best Kicker')
      expect(nudge.textContent).toContain('Best Defense')
      expect(nudge.querySelector('button[data-act="mine"][data-id="p-k1"]')).not.toBeNull()
      expect(nudge.querySelector('button[data-act="mine"][data-id="p-d1"]')).not.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('no nudge once both seats are filled, even on the last pick', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, myPickCount: 13, openK: 0, openDst: 0, extraRows: kdRows }))
      expect((document.getElementById('kdNudge') as HTMLElement).style.display).toBe('none')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('marks a missing room price as faint n/a — distinct from the in-band dash — and counts assessed in the dot tooltip', async () => {
    try {
      await runPage(
        buildPayloads({
          extraRows: [
            boardRow({ playerId: 'p-inband', name: 'In Band', roomDelta: 0 }),
            boardRow({ playerId: 'p-nodata', name: 'No Data', roomDelta: null, roomAdp: null }),
          ],
        }),
      )
      const rmCells = [...document.querySelectorAll('#rows td.rm')] as HTMLElement[]
      expect(rmCells.map((cell) => cell.textContent)).toEqual(['▲▲', '—', 'n/a'])
      expect(rmCells[2]?.title).toBe('no ESPN price for this player')
      const dot = document.querySelector('#rows .ndot') as HTMLElement
      expect(dot.title).toBe('harms/high · 2 assessed · 3 stories')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shows the amber UNRESOLVED chip with the ESPN ids one hover away', async () => {
    try {
      await runPage(buildPayloads({ unresolvedEspnIds: [4362628] }))
      const pill = document.getElementById('unresolvedPill') as HTMLElement
      expect(pill.style.display).not.toBe('none')
      expect(pill.className).toContain('warn')
      expect(document.getElementById('unresolvedLabel')?.textContent).toBe('UNRESOLVED x1')
      expect(pill.title).toContain('#4362628')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('hides the UNRESOLVED chip when every pick resolves', async () => {
    try {
      await runPage(buildPayloads())
      expect((document.getElementById('unresolvedPill') as HTMLElement).style.display).toBe('none')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('styles the panel bench-lander UPS distinctly from the board ups-hi', async () => {
    try {
      await runPage(
        buildPayloads({
          myTurn: true,
          extraCandidates: [
            {
              playerId: 'p-lottery',
              name: 'Lottery Ticket',
              position: 'WR',
              points: 150,
              vor: 10,
              estTeamScore: 1490,
              captureRatio: 0.35,
              deltaVsBest: -10,
              landsOn: 'BENCH',
              upsideScore: 92,
              tier: 3,
              ecrRank: 40,
              roomAdp: 60,
              pNextPick: 0.5,
              pPickAfter: 0.3,
              boosted: false,
              news: null,
              threat: null,
            },
          ],
        }),
      )
      const benchRow = [...document.querySelectorAll('#clockRows tr')][1] as HTMLElement
      expect(benchRow.querySelector('td.ups-bench')?.textContent).toBe('92')
      expect(benchRow.querySelector('td.ups-hi')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Δ-best bands from the evaluate payload', () => {
  const lottery = (deltaVsBest: number): Record<string, unknown> => ({
    playerId: 'p-two',
    name: 'Second Pick',
    position: 'WR',
    points: 150,
    vor: 10,
    estTeamScore: 1500 + deltaVsBest,
    captureRatio: 0.35,
    deltaVsBest,
    landsOn: 'WR',
    upsideScore: 60,
    tier: 2,
    ecrRank: 20,
    roomAdp: 30,
    pNextPick: 0.5,
    pPickAfter: 0.3,
    boosted: false,
    news: null,
    threat: null,
  })

  it('renders a −10 delta green under noiseBand=15 and widens the tooltip band', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, noiseBand: 15, extraCandidates: [lottery(-10)] }))
      const delta = [...document.querySelectorAll('#clockRows tr')][1]?.querySelector('td.delta') as HTMLElement
      expect(delta.className).toContain('odds-hi')
      expect((document.getElementById('deltaH') as HTMLElement).title).toContain('within 15 pts')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the default band without noiseBand: a −10 delta is amber, tooltip says 3', async () => {
    try {
      await runPage(buildPayloads({ myTurn: true, extraCandidates: [lottery(-10)] }))
      const delta = [...document.querySelectorAll('#clockRows tr')][1]?.querySelector('td.delta') as HTMLElement
      expect(delta.className).toContain('odds-mid')
      expect((document.getElementById('deltaH') as HTMLElement).title).toContain('within 3 pts')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('API failure handling', () => {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  it('a 500 on /api/board shows the error pill and recovers on the next poll', async () => {
    loadMarkup()
    const payloads = buildPayloads()
    let boardFails = true
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        if (path === '/api/board' && boardFails) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payloads[path] ?? {}) })
      }),
    )
    const intervals: { fn: () => void; ms: number }[] = []
    vi.stubGlobal(
      'setInterval',
      vi.fn((fn: () => void, ms: number) => {
        intervals.push({ fn, ms })
        return 0
      }),
    )
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      new Function(script)()
      await sleep(25)
      // the failed fetch surfaced instead of freezing silently, and no version was committed
      expect(document.getElementById('pollLabel')?.textContent).toBe('API ERROR')
      expect(document.getElementById('pollPill')?.className).toContain('err')
      expect(document.querySelector('#rows')?.textContent).toContain('loading')

      boardFails = false
      intervals.find((interval) => interval.ms === 2000)?.fn()
      await sleep(25)
      expect(document.querySelector('#rows')?.textContent).toContain('Brock Bowers')
      expect(document.getElementById('pollLabel')?.textContent).not.toBe('API ERROR')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a 409 on ME shows a visible toast', async () => {
    const payloads = buildPayloads()
    loadMarkup()
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, opts?: { method?: string }) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: () => Promise.resolve({ error: 'mock draft active — the room picks for itself' }),
          })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payloads[path] ?? {}) })
      }),
    )
    vi.stubGlobal(
      'setInterval',
      vi.fn(() => 0),
    )
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      new Function(script)()
      await sleep(25)
      const me = document.querySelector('#rows button[data-act="mine"]')
      expect(me).not.toBeNull()
      me?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sleep(25)
      const toast = document.getElementById('toast') as HTMLElement
      expect(toast.style.display).toBe('block')
      expect(toast.textContent).toContain('mock draft active')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
