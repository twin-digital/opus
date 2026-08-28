/**
 * The need-aware "marginal" chooser — the engine behind the frozen `chooseForRoster` export
 * and the `marginal` scorer/policy. Starting seats are valued as marginal starter points
 * over a replacement-filled baseline; bench seats as upside lottery tickets.
 */
import type { LeagueSettings, PlayerId, Position } from '@twin-digital/football-data'

import type { RolloutPlayer } from '../rollout.js'
import { lineupTotalWithReplacement } from '../roster.js'

import { SKILL_POSITIONS, SKILL_SET, type SkillPosition } from './state.js'

export interface RosterState {
  players: RolloutPlayer[]
  lineupSlots: LeagueSettings['lineupSlots']
  /** Baseline an open starting seat is worth; defaults to 0 per position when absent. */
  replacementPoints?: Partial<Record<Position, number>>
}

/** RB/WR absorb FLEX and real depth; QB/TE stop at one backup. Structural anti-hoarding. */
export const positionCaps = (lineupSlots: LeagueSettings['lineupSlots']): Record<SkillPosition, number> => ({
  QB: lineupSlots.QB + 1,
  RB: lineupSlots.RB + lineupSlots.FLEX + 3,
  WR: lineupSlots.WR + lineupSlots.FLEX + 3,
  TE: lineupSlots.TE + 1,
})

/**
 * Need-aware pick for my simulated turns. Starting seats are chosen by marginal starter points
 * over a replacement-filled baseline — an open seat is already worth a freely available player,
 * so a 180-pt QB over a 170-pt replacement loses to a 150-pt RB over a 60-pt one. When no seat
 * improves on replacement (bench territory), bench seats are lottery tickets: choose by upside
 * score, points as tiebreak. Position caps stop hoarding structurally.
 */
export const chooseForRoster = (
  available: RolloutPlayer[],
  roster: RosterState,
  upsideScores: Map<PlayerId, number>,
): RolloutPlayer | null => {
  const caps = positionCaps(roster.lineupSlots)
  const counts: Partial<Record<Position, number>> = {}
  for (const player of roster.players) {
    counts[player.position] = (counts[player.position] ?? 0) + 1
  }
  const replacementPoints = roster.replacementPoints ?? {}
  const openPositions = SKILL_POSITIONS.filter((position) => (counts[position] ?? 0) < caps[position])
  const skill = available.filter((player) => player.points !== null && SKILL_SET.has(player.position))

  const baseTotal = lineupTotalWithReplacement(roster.players, roster.lineupSlots, replacementPoints)
  let bestStarter: RolloutPlayer | null = null
  let bestMarginal = 1e-6
  for (const position of openPositions) {
    // Within a position the top-points player maximizes marginal, so only he needs checking.
    let top: RolloutPlayer | null = null
    for (const player of skill) {
      if (player.position === position && (top === null || (player.points as number) > (top.points as number))) {
        top = player
      }
    }
    if (top === null) {
      continue
    }
    const marginal =
      lineupTotalWithReplacement([...roster.players, top], roster.lineupSlots, replacementPoints) - baseTotal
    if (marginal > bestMarginal) {
      bestMarginal = marginal
      bestStarter = top
    }
  }
  if (bestStarter !== null) {
    return bestStarter
  }

  // Caps only bind while a cap-legal player exists; a draft pick can't be passed.
  const capped = skill.filter((player) => openPositions.includes(player.position as SkillPosition))
  const benchPool = capped.length > 0 ? capped : skill
  let bestBench: RolloutPlayer | null = null
  for (const player of benchPool) {
    if (bestBench === null) {
      bestBench = player
      continue
    }
    const score = upsideScores.get(player.playerId) ?? player.upsideScore ?? 0
    const bestScore = upsideScores.get(bestBench.playerId) ?? bestBench.upsideScore ?? 0
    if (score > bestScore || (score === bestScore && (player.points ?? 0) > (bestBench.points ?? 0))) {
      bestBench = player
    }
  }
  return bestBench
}
