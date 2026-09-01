import {
  SLOT_ELIGIBILITY,
  type LineupSlot,
  type NflTeam,
  type Player,
  type Position,
} from '@twin-digital/football-data'

export interface RosterPlayer {
  playerId: Player['id']
  name: string
  position: Position
  team: NflTeam | null
  byeWeek: number | null
}

export interface RosterSlot {
  slot: LineupSlot
  capacity: number
  players: RosterPlayer[]
}

export interface ByeCollision {
  byeWeek: number
  players: string[] // 'Name (POS)'
}

export interface RosterSummary {
  slots: RosterSlot[]
  /** Unfilled starting seats (everything but BENCH/IR). */
  openStarters: number
  /** Unfilled seats across starters and bench. */
  totalOpen: number
  byeCollisions: ByeCollision[]
}

const DISPLAY_SLOTS: LineupSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH']

/**
 * Group drafted players into lineup slots, greedily in draft order: dedicated slot first, then
 * FLEX where eligible, then BENCH. IR is not a draft-day seat and is folded into nothing.
 */
export const buildRoster = (players: RosterPlayer[], lineupSlots: Record<LineupSlot, number>): RosterSummary => {
  const slots: RosterSlot[] = DISPLAY_SLOTS.map((slot) => ({ slot, capacity: lineupSlots[slot], players: [] }))
  const bySlot = new Map(slots.map((entry) => [entry.slot, entry]))

  for (const player of players) {
    const dedicated = bySlot.get(player.position)
    const flex = bySlot.get('FLEX')
    const bench = bySlot.get('BENCH') as RosterSlot
    if (dedicated !== undefined && dedicated.players.length < dedicated.capacity) {
      dedicated.players.push(player)
    } else if (
      flex !== undefined &&
      flex.players.length < flex.capacity &&
      SLOT_ELIGIBILITY.FLEX.includes(player.position)
    ) {
      flex.players.push(player)
    } else {
      bench.players.push(player)
    }
  }

  const openStarters = slots
    .filter((entry) => entry.slot !== 'BENCH')
    .reduce((sum, entry) => sum + Math.max(0, entry.capacity - entry.players.length), 0)
  const totalOpen = slots.reduce((sum, entry) => sum + Math.max(0, entry.capacity - entry.players.length), 0)

  const byBye = new Map<number, RosterPlayer[]>()
  for (const player of players) {
    if (player.byeWeek === null) {
      continue
    }
    const group = byBye.get(player.byeWeek) ?? []
    group.push(player)
    byBye.set(player.byeWeek, group)
  }
  const byeCollisions = [...byBye.entries()]
    .filter(([, group]) => group.length >= 2)
    .sort(([a], [b]) => a - b)
    .map(([byeWeek, group]) => ({
      byeWeek,
      players: group.map((player) => `${player.name} (${player.position})`),
    }))

  return { slots, openStarters, totalOpen, byeCollisions }
}

/** Minimal shape the lineup optimizer needs; null points (K/DST) fill seats but add nothing. */
export interface LineupPlayer {
  playerId: Player['id']
  position: Position
  points: number | null
}

export interface BestLineup {
  /** Sum of projected points across filled starting seats (K/DST contribute 0). */
  total: number
  /** Starting slot per player; BENCH for everyone who does not start. */
  slotByPlayer: Map<Player['id'], LineupSlot>
}

/**
 * Best starting lineup from a roster: players sorted by points descending, each taking their
 * dedicated seat first, then FLEX where eligible, then BENCH. With FLEX a strict superset of the
 * RB/WR/TE seats this greedy assignment is optimal.
 */
export const bestLineup = (players: LineupPlayer[], lineupSlots: Record<LineupSlot, number>): BestLineup => {
  const open: Partial<Record<LineupSlot, number>> = {}
  for (const slot of DISPLAY_SLOTS) {
    if (slot !== 'BENCH') {
      open[slot] = lineupSlots[slot]
    }
  }
  const slotByPlayer = new Map<Player['id'], LineupSlot>()
  let total = 0
  const sorted = [...players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  for (const player of sorted) {
    const dedicated = open[player.position] ?? 0
    if (dedicated > 0) {
      open[player.position] = dedicated - 1
      slotByPlayer.set(player.playerId, player.position)
      total += player.points ?? 0
    } else if (SLOT_ELIGIBILITY.FLEX.includes(player.position) && (open.FLEX ?? 0) > 0) {
      open.FLEX = (open.FLEX ?? 0) - 1
      slotByPlayer.set(player.playerId, 'FLEX')
      total += player.points ?? 0
    } else {
      slotByPlayer.set(player.playerId, 'BENCH')
    }
  }
  return { total, slotByPlayer }
}

/**
 * Starter total with unfilled skill seats (QB/RB/WR/TE/FLEX) valued at replacement level — the
 * live-grade baseline: an open seat is worth a freely available player, not zero. K/DST seats
 * are excluded: they carry no projections, so they never enter starter totals.
 */
export const lineupTotalWithReplacement = (
  players: LineupPlayer[],
  lineupSlots: Record<LineupSlot, number>,
  replacementPoints: Partial<Record<Position, number>>,
): number => {
  const lineup = bestLineup(players, lineupSlots)
  const filled: Partial<Record<LineupSlot, number>> = {}
  for (const slot of lineup.slotByPlayer.values()) {
    filled[slot] = (filled[slot] ?? 0) + 1
  }
  let total = lineup.total
  for (const slot of ['QB', 'RB', 'WR', 'TE'] as const) {
    total += Math.max(0, lineupSlots[slot] - (filled[slot] ?? 0)) * (replacementPoints[slot] ?? 0)
  }
  const flexReplacement = Math.max(...SLOT_ELIGIBILITY.FLEX.map((position) => replacementPoints[position] ?? 0), 0)
  total += Math.max(0, lineupSlots.FLEX - (filled.FLEX ?? 0)) * flexReplacement
  return total
}
