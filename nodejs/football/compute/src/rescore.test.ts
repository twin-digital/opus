import type { ScoringRule } from '@twin-digital/football-data'
import { describe, expect, it, vi } from 'vitest'

import { buildLeagueScorer } from './rescore.js'

/** The league's actual half-PPR rules (league 1838733150), trimmed to the shape under test. */
const LEAGUE_RULES: ScoringRule[] = [
  { stat: 'passYd', points: 0.04 },
  { stat: 'passTd', points: 4 },
  { stat: 'passInt', points: -1 },
  { stat: 'rushYd', points: 0.1 },
  { stat: 'rushTd', points: 6 },
  { stat: 'rec', points: 0.5 },
  { stat: 'recYd', points: 0.1 },
  { stat: 'recTd', points: 6 },
  { stat: 'fumLost', points: -2 },
  { stat: 'twoPtPass', points: 2 },
  { stat: { espnStatId: 101 }, points: 6 }, // kick-return TD: stat not carried
  { stat: { espnStatId: 201 }, points: 5 }, // FG 50-59: stat not carried
  { stat: { espnStatId: 134 }, points: 0 }, // zero-point rule: silently irrelevant
]

describe('buildLeagueScorer', () => {
  it('rescores a stat line under the league rules', () => {
    const scorer = buildLeagueScorer(LEAGUE_RULES)
    // 4000 pass yd = 160, 30 TD = 120, 10 INT = -10, 300 rush yd = 30
    expect(scorer.score({ passYd: 4000, passTd: 30, passInt: 10, rushYd: 300 })).toBeCloseTo(300, 6)
    // half-PPR: 80 rec = 40, 1000 rec yd = 100, 8 TD = 48, 2 fumbles = -4
    expect(scorer.score({ rec: 80, recYd: 1000, recTd: 8, fumLost: 2 })).toBeCloseTo(184, 6)
    expect(scorer.score({})).toBe(0)
  })

  it('ignores stats with no rule and rules with no stat', () => {
    const scorer = buildLeagueScorer([{ stat: 'rec', points: 0.5 }])
    expect(scorer.score({ rec: 10, recTgt: 100 })).toBeCloseTo(5, 6)
  })

  it('skips non-zero rules for uncarried stats and logs once at build time', () => {
    const log = vi.fn()
    const scorer = buildLeagueScorer(LEAGUE_RULES, log)
    expect(scorer.skippedEspnStatIds).toEqual([101, 201])
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('101, 201')
    scorer.score({ rec: 1 })
    scorer.score({ rec: 2 })
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('does not log when every rule is carried or zero-point', () => {
    const log = vi.fn()
    buildLeagueScorer(
      [
        { stat: 'rec', points: 1 },
        { stat: { espnStatId: 134 }, points: 0 },
      ],
      log,
    )
    expect(log).not.toHaveBeenCalled()
  })
})
