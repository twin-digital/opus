import { SLOT_ELIGIBILITY, type LeagueSettings, type PlayerId, type Position } from '@twin-digital/football-data'

export interface ScoredPlayer {
  playerId: PlayerId
  position: Position
  points: number
}

export interface ReplacementLevel {
  /** Replacement-level points per position: the best player left after every starting seat fills. */
  points: Partial<Record<Position, number>>
  /** Positional rank of that replacement player (RB34 → 34). */
  rank: Partial<Record<Position, number>>
}

/**
 * Replacement level by greedy lineup simulation over the projected pool. League-wide starting
 * seats are lineup slots × league size; players are taken best-points-first, filling their
 * dedicated positional seats before spilling into FLEX (so each FLEX seat goes to the best
 * remaining RB/WR/TE, matching how flexes get started in practice). The replacement level for a
 * position is the best player left at it once all seats are full — its rank emerges from the
 * simulation rather than a fixed starters-times-teams formula.
 */
export const computeReplacementLevels = (
  players: ScoredPlayer[],
  lineupSlots: LeagueSettings['lineupSlots'],
  leagueSize: number,
): ReplacementLevel => {
  const seats: Partial<Record<Position, number>> = {}
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    seats[position] = lineupSlots[position] * leagueSize
  }
  let flexSeats = lineupSlots.FLEX * leagueSize
  const flexEligible = new Set<Position>(SLOT_ELIGIBILITY.FLEX)

  const points: Partial<Record<Position, number>> = {}
  const rank: Partial<Record<Position, number>> = {}
  const startedByPosition: Partial<Record<Position, number>> = {}

  const sorted = [...players].sort((a, b) => b.points - a.points)
  for (const player of sorted) {
    const position = player.position
    if (seats[position] === undefined) {
      continue // K/DST value by market data, not stat lines
    }
    if (points[position] !== undefined) {
      continue // replacement already found for this position
    }
    const dedicated = seats[position]
    if (dedicated > 0) {
      seats[position] = dedicated - 1
      startedByPosition[position] = (startedByPosition[position] ?? 0) + 1
    } else if (flexEligible.has(position) && flexSeats > 0) {
      flexSeats -= 1
      startedByPosition[position] = (startedByPosition[position] ?? 0) + 1
    } else {
      points[position] = player.points
      rank[position] = (startedByPosition[position] ?? 0) + 1
    }
  }
  return { points, rank }
}

/** value over replacement = league points − replacement-level points at the player's position. */
export const valueOverReplacement = (player: ScoredPlayer, replacement: ReplacementLevel): number | null => {
  const level = replacement.points[player.position]
  return level === undefined ? null : player.points - level
}
