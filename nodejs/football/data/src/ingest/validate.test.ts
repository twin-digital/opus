import { describe, expect, it } from 'vitest'

import type { EspnKonaPlayer } from '../fetchers/espn.js'
import type { FpProjectionRow } from '../fetchers/fantasypros-projections.js'
import type { SleeperProjectionRow } from '../fetchers/sleeper.js'
import type { StatKey } from '../reference/stat-key.js'
import {
  ValidationError,
  mapEspnStats,
  mapSleeperStats,
  validateEspnPrescoring,
  validateFantasyProsPrescoring,
  validateSleeperPrescoring,
} from './validate.js'

const sleeperRow = (stats: Record<string, number>): SleeperProjectionRow => ({
  player_id: '11560',
  season: '2026',
  season_type: 'regular',
  stats,
})

describe('mapSleeperStats / mapEspnStats', () => {
  it('keeps only mapped fields', () => {
    expect(mapSleeperStats({ pass_yd: 100, adp_ppr: 12, pts_ppr: 20, gp: 17 })).toEqual({ passYd: 100 })
    expect(mapEspnStats({ '3': 100, '40': 999, '210': 17 })).toEqual({ passYd: 100 })
  })
})

describe('validateSleeperPrescoring', () => {
  it('passes when our scoring reproduces pts_ppr', () => {
    const row = sleeperRow({ pass_yd: 4000, pass_td: 30, pass_int: 10, pts_ppr: 4000 * 0.04 + 30 * 4 - 10 })
    const result = validateSleeperPrescoring([{ row, name: 'Fixture QB' }])
    expect(result.checked).toBe(1)
    expect(result.maxDelta).toBeLessThan(0.001)
  })

  it('fails naming the culprit when a stat is miscounted', () => {
    const row = sleeperRow({ rec: 100, rec_yd: 1000, pts_ppr: 100 * 1 + 1000 * 0.1 + 50 })
    expect(() => validateSleeperPrescoring([{ row, name: 'Fixture WR' }])).toThrow(ValidationError)
    expect(() => validateSleeperPrescoring([{ row, name: 'Fixture WR' }])).toThrow(/Fixture WR/)
  })

  it('skips rows without a prescored total', () => {
    const result = validateSleeperPrescoring([{ row: sleeperRow({ pass_yd: 100 }), name: 'No Points' }])
    expect(result.checked).toBe(0)
  })
})

const konaPlayer = (stats: Record<string, number>, applied: number): EspnKonaPlayer => ({
  id: 1,
  player: {
    id: 1,
    fullName: 'Fixture Back',
    defaultPositionId: 2,
    proTeamId: 8,
    stats: [
      {
        id: '1120261',
        seasonId: 2026,
        scoringPeriodId: 1,
        statSourceId: 1,
        statSplitTypeId: 1,
        stats,
        appliedTotal: applied,
      },
    ],
  },
})

describe('validateEspnPrescoring', () => {
  it('passes when rescoring the stat dict reproduces appliedTotal', () => {
    const player = konaPlayer({ '24': 100, '25': 1, '53': 5, '42': 40, '40': 1234 }, 100 * 0.1 + 6 + 5 + 4)
    const result = validateEspnPrescoring([player], 2026)
    expect(result.checked).toBe(1)
    expect(result.maxDelta).toBeLessThan(0.001)
  })

  it('fails naming the culprit on a mapping break (the statId-renumbering guard)', () => {
    const player = konaPlayer({ '24': 100, '53': 5 }, 100 * 0.1 + 5 + 25)
    expect(() => validateEspnPrescoring([player], 2026)).toThrow(ValidationError)
    expect(() => validateEspnPrescoring([player], 2026)).toThrow(/Fixture Back/)
  })

  it('skips K and DST rows (vocabularies deferred)', () => {
    const kicker = konaPlayer({ '74': 20 }, 60)
    kicker.player.defaultPositionId = 5
    const back = konaPlayer({ '24': 100 }, 10)
    const result = validateEspnPrescoring([kicker, back], 2026)
    expect(result.checked).toBe(1)
  })
})

const fpRow = (stats: Partial<Record<StatKey, number>>, fpts: number): FpProjectionRow => ({
  fpId: 1,
  name: 'Fixture Receiver',
  filename: 'fixture-receiver',
  team: 'DET',
  stats,
  fpts,
})

/** FP scoring without receptions: 0.1/yd rush+rec, 6/TD, 0.04/yd + 4/TD pass, -1 INT, -2 FL. */
const fpBase = (stats: Partial<Record<StatKey, number>>): number =>
  (stats.passYd ?? 0) * 0.04 +
  (stats.passTd ?? 0) * 4 -
  (stats.passInt ?? 0) +
  ((stats.rushYd ?? 0) + (stats.recYd ?? 0)) * 0.1 +
  ((stats.rushTd ?? 0) + (stats.recTd ?? 0)) * 6 -
  (stats.fumLost ?? 0) * 2

describe('validateFantasyProsPrescoring', () => {
  const wrStats = { rec: 100, recYd: 1200, recTd: 8, rushAtt: 4, rushYd: 25, rushTd: 0, fumLost: 1 }
  const qbStats = { passAtt: 500, passCmp: 330, passYd: 4000, passTd: 30, passInt: 10, rushYd: 200, rushTd: 2 }

  it.each([
    ['std', 0],
    ['half', 0.5],
    ['ppr', 1],
  ] as const)('identifies %s scoring from the FPTS column', (format, recPoints) => {
    const rows = [fpRow(wrStats, fpBase(wrStats) + wrStats.rec * recPoints), fpRow(qbStats, fpBase(qbStats))]
    const result = validateFantasyProsPrescoring(rows)
    expect(result).toMatchObject({ checked: 2, format })
    expect(result.maxDelta).toBeLessThan(0.001)
  })

  it('fails when no format reproduces FPTS (the column-order guard)', () => {
    const rows = [fpRow(wrStats, fpBase(wrStats) + 25)]
    expect(() => validateFantasyProsPrescoring(rows)).toThrow(ValidationError)
    expect(() => validateFantasyProsPrescoring(rows)).toThrow(/no scoring format/)
  })

  it('fails as ambiguous when no row carries receptions', () => {
    expect(() => validateFantasyProsPrescoring([fpRow(qbStats, fpBase(qbStats))])).toThrow(/ambiguous/)
  })

  it('fails on an empty sample', () => {
    expect(() => validateFantasyProsPrescoring([])).toThrow(/no rows/)
  })
})
