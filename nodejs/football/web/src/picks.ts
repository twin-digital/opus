import type { DraftPick, ManualPick, PlayerId } from '@twin-digital/football-data'
import type { EspnDraftDetailResponse } from '@twin-digital/football-data/fetchers/espn'

/** One entry of the effective drafted set: polled picks carry pick numbers, manual marks do not. */
export interface EffectivePick {
  playerId: PlayerId
  teamId: number | null
  overall: number | null
  round: number | null
  source: 'espn' | 'manual'
}

export interface MappedPicks {
  picks: DraftPick[]
  /** ESPN player ids on real picks the id map could not resolve (rookie-gap risk). */
  unresolvedEspnIds: number[]
  inProgress: boolean
  drafted: boolean
}

/** mDraftDetail → DraftPick rows. Pre-draft placeholder slots (playerId ≤ 0) are skipped. */
export const mapEspnPicks = (
  response: EspnDraftDetailResponse,
  resolveEspnId: (espnId: string) => PlayerId | undefined,
): MappedPicks => {
  const detail = response.draftDetail
  const picks: DraftPick[] = []
  const unresolvedEspnIds: number[] = []
  for (const pick of detail?.picks ?? []) {
    if (pick.playerId <= 0) {
      continue
    }
    const playerId = resolveEspnId(String(pick.playerId))
    if (playerId === undefined) {
      unresolvedEspnIds.push(pick.playerId)
      continue
    }
    picks.push({
      overall: pick.overallPickNumber,
      round: pick.roundId,
      roundPick: pick.roundPickNumber,
      teamId: pick.teamId,
      playerId,
      isKeeper: pick.keeper ?? false,
    })
  }
  picks.sort((a, b) => a.overall - b.overall)
  return {
    picks,
    unresolvedEspnIds,
    inProgress: detail?.inProgress ?? false,
    drafted: detail?.drafted ?? false,
  }
}

/**
 * Merge polled picks with manual marks, deduped by player. A polled pick wins over a manual
 * mark for the same player (it carries the real pick number); manual-only marks trail in the
 * order they were made.
 */
export const mergePicks = (polled: DraftPick[], manual: ManualPick[]): EffectivePick[] => {
  const merged: EffectivePick[] = [...polled]
    .sort((a, b) => a.overall - b.overall)
    .map((pick) => ({
      playerId: pick.playerId,
      teamId: pick.teamId,
      overall: pick.overall,
      round: pick.round,
      source: 'espn' as const,
    }))
  const seen = new Set(merged.map((pick) => pick.playerId))
  for (const mark of manual) {
    if (seen.has(mark.playerId)) {
      continue
    }
    seen.add(mark.playerId)
    merged.push({ playerId: mark.playerId, teamId: mark.teamId, overall: null, round: null, source: 'manual' })
  }
  return merged
}

/** Team id on the clock at `overall` in a snake draft; null once the draft is complete. */
export const teamOnClock = (pickOrder: number[], overall: number, totalRounds: number): number | null => {
  const size = pickOrder.length
  if (size === 0 || overall < 1 || overall > size * totalRounds) {
    return null
  }
  const round = Math.ceil(overall / size)
  const inRound = overall - (round - 1) * size
  const index = round % 2 === 1 ? inRound - 1 : size - inRound
  return pickOrder[index] ?? null
}

/** 1-based draft slot of a team id, from round-1 pick order; null if the team is not in it. */
export const slotForTeam = (pickOrder: number[], teamId: number): number | null => {
  const index = pickOrder.indexOf(teamId)
  return index === -1 ? null : index + 1
}
