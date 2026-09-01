import { describe, expect, it } from 'vitest'

import { mapSleeperStats } from './ingest/validate.js'
import { ESPN_DEFAULT_PPR, SLEEPER_DEFAULT_PPR, scoreStats } from './scoring.js'

// Real 2026 Sleeper projection shape (Caleb Williams), trimmed to scoring-relevant fields.
const SLEEPER_QB_LINE = {
  pass_att: 514,
  pass_cmp: 316,
  pass_yd: 3651,
  pass_td: 28,
  pass_int: 10,
  pass_2pt: 1,
  rush_att: 75,
  rush_yd: 373,
  rush_td: 3,
  fum_lost: 3,
  pts_ppr: 299.34,
  adp_ppr: 71.9,
}

describe('scoreStats', () => {
  it('reproduces Sleeper pts_ppr from the stat line (INT is -1 in Sleeper defaults)', () => {
    const score = scoreStats(mapSleeperStats(SLEEPER_QB_LINE), SLEEPER_DEFAULT_PPR)
    expect(score).toBeCloseTo(299.34, 2)
  })

  it('scores a receiving line under ESPN defaults (INT -2, full PPR)', () => {
    const score = scoreStats({ rec: 100, recYd: 1200, recTd: 10, fumLost: 1 }, ESPN_DEFAULT_PPR)
    expect(score).toBeCloseTo(100 + 120 + 60 - 2, 5)
  })

  it('ignores stats without a rule and rules without a stat', () => {
    expect(scoreStats({ passAtt: 500, recTgt: 120 }, ESPN_DEFAULT_PPR)).toBe(0)
    expect(scoreStats({}, ESPN_DEFAULT_PPR)).toBe(0)
  })
})
