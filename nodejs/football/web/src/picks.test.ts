import { describe, expect, it } from 'vitest'

import type { DraftPick, ManualPick, PlayerId } from '@twin-digital/football-data'
import type { EspnDraftDetailResponse } from '@twin-digital/football-data/fetchers/espn'

import {
  currentOverallFromPicks,
  mapEspnPicks,
  mergePicks,
  slotForTeam,
  teamOnClock,
  unresolvedPickName,
  unresolvedPlayerId,
} from './picks.js'

const p = (n: number): PlayerId => `p-${String(n).padStart(4, '0')}`

const polledPick = (overall: number, playerId: PlayerId, teamId = 8): DraftPick => ({
  overall,
  round: Math.ceil(overall / 12),
  roundPick: ((overall - 1) % 12) + 1,
  teamId,
  playerId,
  isKeeper: false,
})

const manualPick = (playerId: PlayerId, teamId: number | null, markedAt: string): ManualPick => ({
  playerId,
  teamId,
  markedAt,
})

describe('mapEspnPicks', () => {
  const detail = (
    picks: { overallPickNumber: number; playerId: number; teamId: number }[],
  ): EspnDraftDetailResponse => ({
    draftDetail: {
      drafted: false,
      inProgress: true,
      picks: picks.map((pick) => ({ ...pick, roundId: 1, roundPickNumber: pick.overallPickNumber })),
    },
  })

  it('skips playerId -1 placeholders; unresolved ids become placeholder pick rows', () => {
    const resolve = (espnId: string): PlayerId | undefined => (espnId === '100' ? p(1) : undefined)
    const mapped = mapEspnPicks(
      detail([
        { overallPickNumber: 1, playerId: 100, teamId: 8 },
        { overallPickNumber: 2, playerId: 999, teamId: 1 }, // unresolved (rookie gap)
        { overallPickNumber: 3, playerId: -1, teamId: 9 }, // pre-draft placeholder
      ]),
      resolve,
    )
    expect(mapped.picks).toEqual([polledPick(1, p(1))])
    expect(mapped.unresolvedEspnIds).toEqual([999])
    expect(mapped.unresolvedPicks).toEqual([{ ...polledPick(2, unresolvedPlayerId(999), 1), roundPick: 2 }])
    expect(unresolvedPickName(unresolvedPlayerId(999))).toBe('Unresolved ESPN #999')
    expect(unresolvedPickName(p(1))).toBeNull()
    expect(mapped.inProgress).toBe(true)
  })

  it('handles an empty or missing draftDetail', () => {
    expect(mapEspnPicks({}, () => undefined)).toEqual({
      picks: [],
      unresolvedPicks: [],
      unresolvedEspnIds: [],
      inProgress: false,
      drafted: false,
    })
  })
})

describe('currentOverallFromPicks', () => {
  const espn = (
    overall: number,
  ): { playerId: PlayerId; teamId: number; overall: number; round: number } & {
    source: 'espn'
  } => ({ playerId: p(overall), teamId: 8, overall, round: 1, source: 'espn' })

  it('derives the clock from the highest pick number, not the count', () => {
    // A dropped pick 3 of 4 must not pull the clock back to 4.
    expect(currentOverallFromPicks([espn(1), espn(2), espn(4)], 168)).toBe(5)
    expect(currentOverallFromPicks([espn(1), espn(2), espn(3), espn(4)], 168)).toBe(5)
  })

  it('falls back to the count for unnumbered (manual/mock) marks and clamps at totalPicks', () => {
    const manual = { playerId: p(99), teamId: null, overall: null, round: null, source: 'manual' as const }
    expect(currentOverallFromPicks([espn(1), manual], 168)).toBe(3)
    expect(currentOverallFromPicks([], 168)).toBe(1)
    expect(currentOverallFromPicks([espn(168)], 168)).toBe(168)
  })
})

describe('mergePicks', () => {
  it('dedupes by player with the polled pick winning', () => {
    const merged = mergePicks(
      [polledPick(2, p(2)), polledPick(1, p(1))],
      [manualPick(p(2), null, 't1'), manualPick(p(3), 13, 't2')],
    )
    expect(merged.map((pick) => pick.playerId)).toEqual([p(1), p(2), p(3)])
    expect(merged[1]).toMatchObject({ source: 'espn', overall: 2 })
    expect(merged[2]).toMatchObject({ source: 'manual', overall: null, teamId: 13 })
  })

  it('keeps manual-only marks in the order they were made', () => {
    const merged = mergePicks([], [manualPick(p(5), null, 't1'), manualPick(p(4), null, 't2')])
    expect(merged.map((pick) => pick.playerId)).toEqual([p(5), p(4)])
    expect(merged.every((pick) => pick.source === 'manual')).toBe(true)
  })
})

describe('snake order', () => {
  const pickOrder = [8, 1, 9, 11, 7, 4, 10, 12, 3, 5, 13, 14]

  it('walks the snake', () => {
    expect(teamOnClock(pickOrder, 1, 14)).toBe(8)
    expect(teamOnClock(pickOrder, 11, 14)).toBe(13) // my slot, round 1
    expect(teamOnClock(pickOrder, 12, 14)).toBe(14)
    expect(teamOnClock(pickOrder, 13, 14)).toBe(14) // snake turn
    expect(teamOnClock(pickOrder, 14, 14)).toBe(13)
    expect(teamOnClock(pickOrder, 25, 14)).toBe(8) // round 3 restarts
    expect(teamOnClock(pickOrder, 168, 14)).toBe(8)
    expect(teamOnClock(pickOrder, 169, 14)).toBeNull() // draft over
  })

  it('finds a team slot', () => {
    expect(slotForTeam(pickOrder, 13)).toBe(11)
    expect(slotForTeam(pickOrder, 8)).toBe(1)
    expect(slotForTeam(pickOrder, 99)).toBeNull()
  })
})
