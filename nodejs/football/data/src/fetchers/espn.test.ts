import { describe, expect, it } from 'vitest'

import { summarizeEspnProjection, type EspnStatLine } from './espn.js'

const weekly = (period: number, stats: Record<string, number>, applied: number): EspnStatLine => ({
  id: `112026${period}`,
  seasonId: 2026,
  scoringPeriodId: period,
  statSourceId: 1,
  statSplitTypeId: 1,
  stats,
  appliedTotal: applied,
})

describe('summarizeEspnProjection', () => {
  it('sums weekly projection rows to season totals', () => {
    const lines = [
      weekly(1, { '24': 80, '53': 4, '42': 30 }, 19),
      weekly(2, { '24': 90, '53': 5, '42': 40 }, 22),
      weekly(3, {}, 0), // bye week
    ]
    const summary = summarizeEspnProjection(lines, 2026)
    expect(summary).not.toBeNull()
    expect(summary?.stats).toEqual({ '24': 170, '53': 9, '42': 70 })
    expect(summary?.weeks).toBe(3)
    expect(summary?.appliedTotal).toBe(41)
  })

  it('ignores actuals (statSourceId 0) and other seasons', () => {
    const lines = [
      weekly(1, { '24': 80 }, 8),
      { ...weekly(2, { '24': 999 }, 99), statSourceId: 0 },
      { ...weekly(3, { '24': 999 }, 99), seasonId: 2025 },
    ]
    const summary = summarizeEspnProjection(lines, 2026)
    expect(summary?.stats).toEqual({ '24': 80 })
    expect(summary?.appliedTotal).toBe(8)
  })

  it('falls back to the season-total row when no weekly split exists', () => {
    const seasonRow: EspnStatLine = {
      id: '102026',
      seasonId: 2026,
      scoringPeriodId: 0,
      statSourceId: 1,
      statSplitTypeId: 0,
      stats: { '24': 1400, '53': 60 },
      appliedTotal: 250,
    }
    const summary = summarizeEspnProjection([seasonRow], 2026)
    expect(summary?.stats).toEqual({ '24': 1400, '53': 60 })
    expect(summary?.weeks).toBe(0)
    expect(summary?.appliedTotal).toBe(250)
  })

  it('returns null when the player has no projection rows', () => {
    expect(summarizeEspnProjection([], 2026)).toBeNull()
    expect(summarizeEspnProjection(undefined, 2026)).toBeNull()
  })
})
