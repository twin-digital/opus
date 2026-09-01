/**
 * Immutable draft-state core for the strategy layer. A `DraftState` is a pool plus the
 * picks made so far; `applyPick` returns a new state; `runDraft` drives policies to
 * completion. Mid-draft entry is supported via `baseOverall` (the overall number of the
 * first in-state pick) and `initialRosters` (players teams already hold) — this is how the
 * frozen rollout API replays a live draft through the same machinery.
 */
import type { LeagueSettings, PlayerId, Position } from '@twin-digital/football-data'

import { sigmaForPick } from '../draft-math.js'
import type { Benchmarks, RolloutPlayer } from '../rollout.js'

import type { Rng } from './rng.js'

export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type SkillPosition = (typeof SKILL_POSITIONS)[number]
export const SKILL_SET = new Set<Position>(SKILL_POSITIONS)

/** Room-ADP order: nulls last, points then playerId as tiebreaks. Shared by the mean-path
 * room model (`simulateRoomSegment`) and `adpPolicy` — one comparator, one room. */
export const compareByRoomAdp = (a: RolloutPlayer, b: RolloutPlayer): number =>
  (a.roomAdp ?? Number.POSITIVE_INFINITY) - (b.roomAdp ?? Number.POSITIVE_INFINITY) ||
  (b.points ?? 0) - (a.points ?? 0) ||
  a.playerId.localeCompare(b.playerId)

export interface SimPool {
  players: readonly RolloutPlayer[]
  byId: ReadonlyMap<PlayerId, RolloutPlayer>
  /** Room-ADP order (nulls last) — ADP-driven policies walk this. */
  byAdp: readonly RolloutPlayer[]
  /** Projected skill players, points descending — slate builders walk this. */
  skillByPoints: readonly RolloutPlayer[]
  /** Projected skill players, VOR descending. */
  skillByVor: readonly RolloutPlayer[]
  teams: number
  rounds: number
  lineupSlots: LeagueSettings['lineupSlots']
  replacementPoints: Partial<Record<Position, number>>
  benchmarks: Benchmarks
  upsideScores: ReadonlyMap<PlayerId, number>
  /** σ of the pick each priced player goes at (the survival-odds model). */
  sigmaById: ReadonlyMap<PlayerId, number>
  /** Off the board before any sim starts: already-drafted players, bans. */
  unavailable: ReadonlySet<PlayerId>
}

export interface SimPoolParts {
  players: readonly RolloutPlayer[]
  teams: number
  rounds: number
  lineupSlots: LeagueSettings['lineupSlots']
  replacementPoints: Partial<Record<Position, number>>
  benchmarks: Benchmarks
  upsideScores?: ReadonlyMap<PlayerId, number>
  /** Defaults to sigmaForPick(roomAdp, null) per priced player. */
  sigmaById?: ReadonlyMap<PlayerId, number>
  unavailable?: ReadonlySet<PlayerId>
}

export const makeSimPool = (parts: SimPoolParts): SimPool => {
  const skill = parts.players.filter((player) => player.points !== null && SKILL_SET.has(player.position))
  let sigmaById = parts.sigmaById
  if (sigmaById === undefined) {
    const computed = new Map<PlayerId, number>()
    for (const player of parts.players) {
      if (player.roomAdp !== null) {
        computed.set(player.playerId, sigmaForPick(player.roomAdp, null))
      }
    }
    sigmaById = computed
  }
  return {
    players: parts.players,
    byId: new Map(parts.players.map((player) => [player.playerId, player])),
    byAdp: [...parts.players].sort(compareByRoomAdp),
    skillByPoints: [...skill].sort((a, b) => (b.points as number) - (a.points as number)),
    skillByVor: [...skill].sort((a, b) => (b.vor ?? Number.NEGATIVE_INFINITY) - (a.vor ?? Number.NEGATIVE_INFINITY)),
    teams: parts.teams,
    rounds: parts.rounds,
    lineupSlots: parts.lineupSlots,
    replacementPoints: parts.replacementPoints,
    benchmarks: parts.benchmarks,
    upsideScores: parts.upsideScores ?? new Map(),
    sigmaById,
    unavailable: parts.unavailable ?? new Set(),
  }
}

/** Skill roster seats = draft rounds − K/DST seats; K/DST autopick in the last rounds. */
export const skillRounds = (pool: SimPool): number => pool.rounds - pool.lineupSlots.K - pool.lineupSlots.DST

export interface DraftPick {
  overall: number
  teamId: number
  playerId: PlayerId
}

export interface DraftState {
  pool: SimPool
  /** teamId (draft slot, 1-based) on the clock at each overall pick. */
  pickOrder: readonly number[]
  /** Overall number of the first in-state pick; > 1 for mid-draft entry. */
  baseOverall: number
  picks: readonly DraftPick[]
  /** Players each team held before `baseOverall` (mid-draft entry). */
  initialRosters: ReadonlyMap<number, readonly PlayerId[]>
  /** Everything off the board: pool.unavailable ∪ initial rosters ∪ picks. */
  taken: ReadonlySet<PlayerId>
}

/** Snake order: teamId per overall pick — odd rounds 1..teams, even rounds reversed. */
export const snakePickOrder = (teams: number, rounds: number): number[] => {
  const order: number[] = []
  for (let round = 1; round <= rounds; round += 1) {
    for (let i = 1; i <= teams; i += 1) {
      order.push(round % 2 === 1 ? i : teams - i + 1)
    }
  }
  return order
}

export interface DraftStateOptions {
  baseOverall?: number
  initialRosters?: ReadonlyMap<number, readonly PlayerId[]>
  pickOrder?: readonly number[]
}

export const makeDraftState = (pool: SimPool, options: DraftStateOptions = {}): DraftState => {
  const initialRosters = options.initialRosters ?? new Map<number, readonly PlayerId[]>()
  const taken = new Set(pool.unavailable)
  for (const ids of initialRosters.values()) {
    for (const id of ids) {
      taken.add(id)
    }
  }
  return {
    pool,
    pickOrder: options.pickOrder ?? snakePickOrder(pool.teams, pool.rounds),
    baseOverall: options.baseOverall ?? 1,
    picks: [],
    initialRosters,
    taken,
  }
}

/** Overall number of the pick on the clock. */
export const currentOverall = (state: DraftState): number => state.baseOverall + state.picks.length

/** 1-based round of the pick on the clock. */
export const currentRound = (state: DraftState): number => Math.ceil(currentOverall(state) / state.pool.teams)

export const isComplete = (state: DraftState): boolean => currentOverall(state) > state.pickOrder.length

export const teamOnClock = (state: DraftState): number => {
  const team = state.pickOrder[currentOverall(state) - 1]
  if (team === undefined) {
    throw new Error('draft complete: no team on the clock')
  }
  return team
}

/** New state with `playerId` taken by the team on the clock. Throws on illegal picks. */
export const applyPick = (state: DraftState, playerId: PlayerId): DraftState => {
  if (isComplete(state)) {
    throw new Error('draft complete: cannot pick')
  }
  if (state.taken.has(playerId)) {
    throw new Error(`player already off the board: ${playerId}`)
  }
  if (!state.pool.byId.has(playerId)) {
    throw new Error(`player not in pool: ${playerId}`)
  }
  const overall = currentOverall(state)
  const taken = new Set(state.taken)
  taken.add(playerId)
  return {
    ...state,
    picks: [...state.picks, { overall, teamId: teamOnClock(state), playerId }],
    taken,
  }
}

export const availablePlayers = (state: DraftState): RolloutPlayer[] =>
  state.pool.players.filter((player) => !state.taken.has(player.playerId))

export const rosterIdsOf = (state: DraftState, teamId: number): PlayerId[] => {
  const ids = [...(state.initialRosters.get(teamId) ?? [])]
  for (const pick of state.picks) {
    if (pick.teamId === teamId) {
      ids.push(pick.playerId)
    }
  }
  return ids
}

/** Team roster resolved against the pool; held ids the pool doesn't know are skipped. */
export const rosterOf = (state: DraftState, teamId: number): RolloutPlayer[] =>
  rosterIdsOf(state, teamId).flatMap((id) => {
    const player = state.pool.byId.get(id)
    return player === undefined ? [] : [player]
  })

/** Count of a team's skill-position players (the seats rollouts race to fill). */
export const skillCountOf = (state: DraftState, teamId: number): number =>
  rosterOf(state, teamId).filter((player) => SKILL_SET.has(player.position)).length

/** Stop condition: the seat's skill seats are full — K/DST carry no projected points, so
 * simulating past this changes no fitness metric. */
export const untilSeatSkillFull =
  (teamId: number) =>
  (state: DraftState): boolean =>
    skillCountOf(state, teamId) >= skillRounds(state.pool)

export type PickPolicy = (state: DraftState, teamId: number, rng: Rng) => PlayerId | null

/**
 * Drive the draft to completion (or until `until` fires): each pick asks the on-clock
 * team's policy. A policy returning null (pool exhausted) ends the draft.
 */
export const runDraft = (
  state: DraftState,
  policies: (teamId: number) => PickPolicy,
  rng: Rng,
  until?: (state: DraftState) => boolean,
): DraftState => {
  let current = state
  while (!isComplete(current) && !(until?.(current) ?? false)) {
    const teamId = teamOnClock(current)
    const playerId = policies(teamId)(current, teamId, rng)
    if (playerId === null) {
      break
    }
    current = applyPick(current, playerId)
  }
  return current
}
