/**
 * Monte Carlo candidate evaluation. Where the deterministic `evaluateCandidates` walks the
 * single most-likely draft path (argmax room picks), this integrates the nonlinear best-lineup
 * objective over the room model's own uncertainty: per candidate, K sampled rollouts in which
 * every opponent pick is drawn from the profiled `takeDistribution` (per-team σ, positional
 * timing, loyalty, and roster-need shaping all apply). My own future picks follow the greedy
 * `chooseForRoster` policy, optionally sharpened by a one-ply lookahead at my next pick
 * (`continuation: 'one-ply'`): branch over the candidate slate there, greedy after, keep the
 * best branch — the correction for greedy declining a positional-timing pick it should take.
 *
 * RNG is counter-based: every uniform is a pure hash of (seed, scenario, team, round, draw j)
 * — no streams, so no stream-collision question, and any number of draws per pick coordinate.
 *
 * Coupling (common random numbers): each opponent pick REJECTION-samples from the pick's
 * static proposal (availability hazard × loyalty over the full pool, taken players included),
 * redrawing on a hit of an unavailable player and thinning by the dynamic roster-need
 * multiplier. Proposal draws are identical across candidate arms, so two arms differing by one
 * removed player diverge only where that player would genuinely have been picked — a maximal
 * coupling for the remove-one case; candidate deltas difference the shared room noise out.
 * The thinning step (accept with probability mult/maxMult) makes the draw exact for the
 * dynamic `takeDistribution`. Same seed → identical results.
 */
import type { LineupSlot, PlayerId, Position } from '@twin-digital/football-data'

import type { BoardState } from './board.js'
import { overallPicksForSlot } from './draft-math.js'
import {
  buildPool,
  candidateSlate,
  captureRatio,
  livePositionCounts,
  type CandidateEvaluation,
  type EvaluateOptions,
  type Pool,
  type RolloutPlayer,
} from './rollout.js'
import {
  pickHazardWeight,
  pickPositionMultipliers,
  teamAtPick,
  type PositionCounts,
  type RoomProfiles,
} from './room-profiles.js'
import { bestLineup } from './roster.js'
import { positionCaps } from './sim/marginal.js'

import { compareByRoomAdp, SKILL_POSITIONS, SKILL_SET, type SkillPosition } from './sim/state.js'

/** Default scenario count: sampling se ≈ σ/√300 ≈ 1 pt, far under the model-error band. */
export const MC_DEFAULT_SAMPLES = 300

/** Fixed default seed: two evaluations of the same board are identical unless reseeded. */
export const MC_DEFAULT_SEED = 20260828

/**
 * Hazard-table cutoff, relative to the pick's total hazard mass. Players below it are far
 * enough past the pick's horizon that even a 100× shaping multiplier leaves them under 1e-5
 * of the pool's mass; dropping them shrinks every pick's sampling pool several-fold.
 */
const HAZARD_CUTOFF_RATIO = 1e-7

/** Rejection attempts per pick before the exact renormalized fallback takes over. */
const REJECTION_CAP = 200

/**
 * Counter-based uniforms: every draw is a pure hash of (seed, scenario, team, round, draw),
 * finalized through one mulberry step — bit-identical to
 * `mulberry32(hashSeed(seed, scenario, teamId, round, draw))()`. The hash mixes its parts
 * sequentially, so the pick-level prefix is computed once (`pickPrefix`) and each attempt in
 * the rejection loop pays only the final mix (`prefixU`).
 */
const mixPart = (h: number, part: number): number => {
  h = (h + (part >>> 0)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const pickPrefix = (seed: number, scenario: number, teamId: number, round: number): number =>
  mixPart(mixPart(mixPart(mixPart(0x9e3779b9, seed), scenario), teamId), round)

const prefixU = (prefix: number, draw: number): number => {
  let t = (mixPart(prefix, draw) + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface McCandidateEvaluation extends CandidateEvaluation {
  /** Monte Carlo standard error of estTeamScore: std of scenario totals / √K. */
  se: number
  /** Standard error of the CRN-paired per-scenario delta vs the top-mean candidate; 0 for it. */
  deltaSe: number
  /**
   * Mean estTeamScore minus the pre-registered reference candidate's (the top-VOR candidate in
   * the slate). Unlike deltaVsBest this reference is chosen before any estimate is seen, so it
   * carries no winner's-curse bias; it is the primary delta for reporting.
   */
  deltaVsRef: number
  /**
   * Share of scenarios in which this candidate's starter total is the maximum; exact ties in a
   * scenario split the win 1/m, so pBest stays a distribution across candidates.
   */
  pBest: number
  /** Number of candidates (including this one) whose per-scenario totals are all bit-identical. */
  exactTies: number
  /** Scenario count K behind the estimates. */
  samples: number
}

export interface EvaluateMCOptions extends EvaluateOptions {
  /** Sampled rollouts per candidate (default 300). */
  samples?: number
  /** Root RNG seed (default fixed, for reproducible evaluations). */
  seed?: number
  /**
   * My-picks policy inside each scenario (default 'one-ply'): greedy everywhere, or greedy
   * with a one-ply branch at my next pick (greedy afterwards) — the correction for greedy's
   * roster-state-dependent refusal of positional-timing picks.
   */
  continuation?: 'greedy' | 'one-ply'
  /**
   * One-ply branch set (default 'position-tops': the top-2 available by points and top by
   * upside at each skill position, plus the greedy choice — the only branches a greedy tail
   * can rank first, within tail noise). 'slate' branches exhaustively over the evaluation
   * slate: the reference definition, ~5× the cost.
   */
  branch?: 'slate' | 'position-tops'
  /**
   * Test instrumentation: called once per (candidate, scenario) with the roomPool players the
   * simulated room removed (the winning branch's path under 'one-ply').
   */
  instrument?: (candidateId: PlayerId, scenario: number, roomPicks: readonly PlayerId[]) => void
  /**
   * Checked at each per-candidate yield of the async driver; returning true abandons the
   * evaluation (the driver resolves null). Lets a superseded board version stop paying for
   * an answer nobody will read.
   */
  shouldAbort?: () => boolean
}

/** Skill + K/DST position indexes for the per-pick multiplier array. */
const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
const POSITION_INDEX = new Map<Position, number>(POSITIONS.map((position, index) => [position, index]))

/** One pick's static proposal as struct-of-arrays; `weight` premultiplies the team's loyalty. */
interface PickTable {
  count: number
  /** Index into roomPool. */
  playerIdx: Int32Array
  weight: Float64Array
  posIdx: Uint8Array
  /** Cumulative weights for O(log n) proposal draws. */
  cdf: Float64Array
  total: number
}

interface McContext {
  pool: Pool
  profiles: RoomProfiles | null
  pickOrder: number[]
  teams: number
  fromOverall: number
  myPicks: number[]
  seedCounts: Map<number, PositionCounts>
  /** Undrafted, unbanned, unheld pool in room-ADP order. */
  roomPool: RolloutPlayer[]
  /** Per room pick between fromOverall and my last pick. */
  tables: Map<number, PickTable>
  myRoster: RolloutPlayer[]
  indexByPlayer: Map<PlayerId, number>
  /** Projected skill players per position (roomPool indexes), points desc then pool order. */
  skillByPoints: Record<SkillPosition, Int32Array>
  /** The same players ordered by the bench key: upside desc, points desc, pool order. */
  skillByUpside: Record<SkillPosition, Int32Array>
  /** The evaluation slate as roomPool indexes — the one-ply branch set at my next pick. */
  slateIdxs: Int32Array
  skillRounds: number
  seed: number
  onePly: boolean
  branchMode: 'slate' | 'position-tops'
  lineup: LineupSpec
  /**
   * Proposal-draw memo keyed (overall, scenario): the drawn table rows and acceptance
   * uniforms are pure functions of the coordinates, and every candidate arm and one-ply
   * branch replays the same sequence — visited hundreds of times per coordinate.
   */
  drawCache: Map<number, DrawCache>
  /** Per-rollout taken marks over roomPool: takenStamp[i] === stamp ⇔ taken this branch. */
  takenStamp: Int32Array
  stampCounter: number
  /** Scratch weights sized to the largest table (exact-fallback path only). */
  scratch: Float64Array
  /**
   * Position-multiplier memo keyed (overall, on-clock team's counts): both are small and
   * discrete, and the multipliers are deterministic in them, so hits dominate across rollouts.
   */
  multMemo: Map<number, Float64Array>
}

/** Pack (overall, counts-present flag, per-position counts capped at 7) into one memo key. */
const multKey = (overall: number, counts: PositionCounts | undefined): number => {
  // No-counts is not zero-counts: needMult's late-gap boost fires only with count data.
  let key = overall * 2 + (counts === undefined ? 0 : 1)
  for (const position of POSITIONS) {
    key = key * 8 + Math.min(counts?.get(position) ?? 0, 7)
  }
  return key
}

const positionMults = (context: McContext, overall: number, counts: PositionCounts | undefined): Float64Array => {
  const key = multKey(overall, counts)
  const cached = context.multMemo.get(key)
  if (cached !== undefined) {
    return cached
  }
  const mults = pickPositionMultipliers(context.profiles, context.pickOrder, overall, counts)
  const values = new Float64Array(POSITIONS.length)
  for (let i = 0; i < POSITIONS.length; i += 1) {
    values[i] = mults.byPosition[POSITIONS[i] as Position]
  }
  context.multMemo.set(key, values)
  return values
}

const cloneCounts = (counts: Map<number, PositionCounts>): Map<number, PositionCounts> =>
  new Map([...counts].map(([teamId, team]) => [teamId, new Map(team)]))

const skillCount = (roster: RolloutPlayer[]): number =>
  roster.reduce((sum, player) => (SKILL_SET.has(player.position) ? sum + 1 : sum), 0)

/**
 * Allocation-free `lineupTotalWithReplacement` for the hot loops. Per-position tops fill the
 * dedicated seats, the best leftover RB/WR/TE fills each FLEX seat, and open skill seats score
 * replacement — the identical objective (the greedy global assignment is optimal because FLEX
 * eligibility is a superset of the dedicated seats it competes with).
 */
interface LineupSpec {
  seats: Record<SkillPosition, number>
  flexSeats: number
  replacement: Record<SkillPosition, number>
  flexReplacement: number
  /** Scratch per-position points buffers (single-threaded reuse). */
  buffers: Record<SkillPosition, Float64Array>
  /** Scratch counts per POSITION_INDEX slot / FLEX walk cursors. */
  lengths: Int32Array
  cursor: Int32Array
}

const makeLineupSpec = (pool: Pool): LineupSpec => {
  const lineupSlots = pool.settings.lineupSlots
  const replacementPoints = pool.replacement.points
  const seats = {} as Record<SkillPosition, number>
  const replacement = {} as Record<SkillPosition, number>
  const buffers = {} as Record<SkillPosition, Float64Array>
  for (const position of SKILL_POSITIONS) {
    seats[position] = lineupSlots[position]
    replacement[position] = replacementPoints[position] ?? 0
    buffers[position] = new Float64Array(64)
  }
  return {
    seats,
    flexSeats: lineupSlots.FLEX,
    replacement,
    flexReplacement: Math.max(replacement.RB, replacement.WR, replacement.TE, 0),
    buffers,
    lengths: new Int32Array(POSITIONS.length),
    cursor: new Int32Array(3),
  }
}

const FLEX_POSITIONS = ['RB', 'WR', 'TE'] as const

const pushPoints = (spec: LineupSpec, player: RolloutPlayer): void => {
  const position = player.position
  if (position === 'K' || position === 'DST' || player.points === null) {
    return // K/DST seats score 0; unprojected players never enter starter totals
  }
  const slot = POSITION_INDEX.get(position) as number
  const buffer = spec.buffers[position]
  // Insertion sort descending; rosters are ≤ 20 players.
  let i = spec.lengths[slot] as number
  const points = player.points
  while (i > 0 && (buffer[i - 1] as number) < points) {
    buffer[i] = buffer[i - 1] as number
    i -= 1
  }
  buffer[i] = points
  spec.lengths[slot] = (spec.lengths[slot] as number) + 1
}

const fastStarterTotal = (spec: LineupSpec, roster: RolloutPlayer[], extra?: RolloutPlayer): number => {
  spec.lengths.fill(0)
  for (const player of roster) {
    pushPoints(spec, player)
  }
  if (extra !== undefined) {
    pushPoints(spec, extra)
  }
  let total = 0
  for (const position of SKILL_POSITIONS) {
    const seatCount = spec.seats[position]
    const length = spec.lengths[POSITION_INDEX.get(position) as number] as number
    const filled = Math.min(seatCount, length)
    const buffer = spec.buffers[position]
    for (let i = 0; i < filled; i += 1) {
      total += buffer[i] as number
    }
    total += (seatCount - filled) * spec.replacement[position]
  }
  // FLEX seats: best leftovers across RB/WR/TE, replacement when none remain.
  spec.cursor[0] = spec.seats.RB
  spec.cursor[1] = spec.seats.WR
  spec.cursor[2] = spec.seats.TE
  for (let seat = 0; seat < spec.flexSeats; seat += 1) {
    let bestSlot = -1
    let best = Number.NEGATIVE_INFINITY
    for (let slot = 0; slot < FLEX_POSITIONS.length; slot += 1) {
      const position = FLEX_POSITIONS[slot] as SkillPosition
      const at = spec.cursor[slot] as number
      if (at < (spec.lengths[POSITION_INDEX.get(position) as number] as number)) {
        const points = spec.buffers[position][at] as number
        if (points > best) {
          best = points
          bestSlot = slot
        }
      }
    }
    // bestLineup seats any leftover (even below replacement); replacement fills only empties.
    if (bestSlot === -1) {
      total += spec.flexReplacement
    } else {
      total += best
      spec.cursor[bestSlot] = (spec.cursor[bestSlot] as number) + 1
    }
  }
  return total
}

/** Memoized proposal draws for one (overall, scenario): table rows and acceptance uniforms. */
interface DrawCache {
  rows: Int32Array
  u2: Float64Array
  filled: number
}

const drawsFor = (
  context: McContext,
  table: PickTable,
  overall: number,
  scenario: number,
  teamId: number,
  round: number,
  upTo: number,
): DrawCache => {
  const key = overall * 1_048_576 + scenario
  let cache = context.drawCache.get(key)
  if (cache === undefined) {
    cache = { rows: new Int32Array(8), u2: new Float64Array(8), filled: 0 }
    context.drawCache.set(key, cache)
  }
  if (cache.filled >= upTo) {
    return cache
  }
  if (cache.rows.length < upTo) {
    const size = Math.max(upTo, cache.rows.length * 2)
    const rows = new Int32Array(size)
    rows.set(cache.rows)
    const u2 = new Float64Array(size)
    u2.set(cache.u2)
    cache.rows = rows
    cache.u2 = u2
  }
  const prefix = pickPrefix(context.seed, scenario, teamId, round)
  for (let draw = cache.filled; draw < upTo; draw += 1) {
    cache.rows[draw] = searchCdf(table.cdf, table.count, prefixU(prefix, 2 * draw) * table.total)
    cache.u2[draw] = prefixU(prefix, 2 * draw + 1)
  }
  cache.filled = upTo
  return cache
}

/** Smallest index whose cdf value exceeds `target` (weights are strictly positive). */
const searchCdf = (cdf: Float64Array, count: number, target: number): number => {
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((cdf[mid] as number) > target) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

/**
 * One sampled opponent pick at `overall`: rejection sampling from the pick's static proposal,
 * thinned by the dynamic roster-need multipliers — an exact draw from `takeDistribution` over
 * the live pool (see the module doc). Returns the roomPool index taken, or -1 when nothing is
 * available at all.
 */
const sampleRoomPick = (
  context: McContext,
  overall: number,
  scenario: number,
  stamp: number,
  candidateIdx: number,
  counts: Map<number, PositionCounts>,
): number => {
  const teamId = teamAtPick(context.pickOrder, overall)
  const round = Math.ceil(overall / context.teams)
  const posMults = positionMults(context, overall, counts.get(teamId))
  let maxMult = 0
  for (const mult of posMults) {
    maxMult = Math.max(maxMult, mult)
  }
  const table = context.tables.get(overall)
  const taken = context.takenStamp
  let chosenIdx = -1
  if (table !== undefined && table.total > 0 && maxMult > 0) {
    let cache = drawsFor(context, table, overall, scenario, teamId, round, 8)
    for (let draw = 0; draw < REJECTION_CAP; draw += 1) {
      if (draw >= cache.filled) {
        cache = drawsFor(context, table, overall, scenario, teamId, round, Math.min(cache.filled * 2, REJECTION_CAP))
      }
      const i = cache.rows[draw] as number
      const idx = table.playerIdx[i] as number
      if (taken[idx] === stamp || idx === candidateIdx) {
        continue // hit an off-the-board player: redraw (the coupling's do-over)
      }
      const mult = posMults[table.posIdx[i] as number] as number
      if (mult <= 0) {
        continue // dynamic weight zero: never accepted
      }
      if (mult >= maxMult || (cache.u2[draw] as number) * maxMult < mult) {
        chosenIdx = idx
        break
      }
    }
    if (chosenIdx === -1) {
      const prefix = pickPrefix(context.seed, scenario, teamId, round)
      chosenIdx = exactTablePick(context, table, posMults, prefix, stamp, candidateIdx)
    }
  }
  if (chosenIdx === -1) {
    const prefix = pickPrefix(context.seed, scenario, teamId, round)
    chosenIdx = fallbackPick(context, overall, prefix, stamp, candidateIdx, counts, teamId)
  }
  if (chosenIdx !== -1) {
    taken[chosenIdx] = stamp
    const position = (context.roomPool[chosenIdx] as RolloutPlayer).position
    const team = counts.get(teamId) ?? new Map<Position, number>()
    team.set(position, (team.get(position) ?? 0) + 1)
    counts.set(teamId, team)
  }
  return chosenIdx
}

/** The cap ran out (little live mass left in the proposal): renormalize the table exactly. */
const exactTablePick = (
  context: McContext,
  table: PickTable,
  posMults: Float64Array,
  prefix: number,
  stamp: number,
  candidateIdx: number,
): number => {
  const taken = context.takenStamp
  const weights = context.scratch
  let total = 0
  for (let i = 0; i < table.count; i += 1) {
    const idx = table.playerIdx[i] as number
    if (taken[idx] === stamp || idx === candidateIdx) {
      weights[i] = 0
      continue
    }
    const weight = (table.weight[i] as number) * (posMults[table.posIdx[i] as number] as number)
    weights[i] = weight
    total += weight
  }
  if (total <= 0) {
    return -1
  }
  const target = prefixU(prefix, 2 * REJECTION_CAP) * total
  let acc = 0
  let lastPositive = -1
  for (let i = 0; i < table.count; i += 1) {
    const weight = weights[i] as number
    if (weight <= 0) {
      continue
    }
    lastPositive = i
    acc += weight
    if (acc >= target) {
      return table.playerIdx[i] as number
    }
  }
  return lastPositive === -1 ? -1 : (table.playerIdx[lastPositive] as number) // float-rounding guard
}

/** Every tabled player is gone (deep-pool tail): weigh the full remainder exactly. */
const fallbackPick = (
  context: McContext,
  overall: number,
  prefix: number,
  stamp: number,
  candidateIdx: number,
  counts: Map<number, PositionCounts>,
  teamId: number,
): number => {
  const mults = pickPositionMultipliers(context.profiles, context.pickOrder, overall, counts.get(teamId))
  const taken = context.takenStamp
  const indexes: number[] = []
  const weights: number[] = []
  let total = 0
  for (let idx = 0; idx < context.roomPool.length; idx += 1) {
    if (taken[idx] === stamp || idx === candidateIdx) {
      continue
    }
    const player = context.roomPool[idx] as RolloutPlayer
    const weight =
      pickHazardWeight(context.profiles, context.pickOrder, overall, player) *
      mults.byPosition[player.position] *
      (mults.loyalty?.get(player.playerId)?.strength ?? 1)
    indexes.push(idx)
    weights.push(weight)
    total += weight
  }
  if (indexes.length === 0) {
    return -1
  }
  if (total <= 0) {
    return indexes[0] as number // roomPool is ADP-ordered: the mean-path tiebreak
  }
  const target = prefixU(prefix, 2 * REJECTION_CAP + 1) * total
  let acc = 0
  for (let i = 0; i < indexes.length; i += 1) {
    acc += weights[i] as number
    if (acc >= target) {
      return indexes[i] as number
    }
  }
  return indexes[indexes.length - 1] as number
}

/** First entry of a per-position index array still on the board this branch. */
const headAvailable = (context: McContext, order: Int32Array, stamp: number, candidateIdx: number): number => {
  const taken = context.takenStamp
  for (const idx of order) {
    if (taken[idx] !== stamp && idx !== candidateIdx) {
      return idx
    }
  }
  return -1
}

/**
 * My greedy pick — `chooseForRoster` semantics over the per-position sorted indexes instead of
 * a full pool scan (the hot path: within a position only the top player by each key can win).
 * Starter seats by marginal starter points over the replacement baseline; else bench lottery
 * tickets by upside, points as tiebreak; caps bind only while a cap-legal player exists.
 */
const chooseMine = (context: McContext, roster: RolloutPlayer[], stamp: number, candidateIdx: number): number => {
  const { pool, roomPool } = context
  const caps = positionCaps(pool.settings.lineupSlots)
  const counts: Partial<Record<Position, number>> = {}
  for (const player of roster) {
    counts[player.position] = (counts[player.position] ?? 0) + 1
  }
  const openPositions = SKILL_POSITIONS.filter((position) => (counts[position] ?? 0) < caps[position])

  const baseTotal = fastStarterTotal(context.lineup, roster)
  let bestStarter = -1
  let bestMarginal = 1e-6
  for (const position of openPositions) {
    const idx = headAvailable(context, context.skillByPoints[position], stamp, candidateIdx)
    if (idx === -1) {
      continue
    }
    const top = roomPool[idx] as RolloutPlayer
    const marginal = fastStarterTotal(context.lineup, roster, top) - baseTotal
    if (marginal > bestMarginal) {
      bestMarginal = marginal
      bestStarter = idx
    }
  }
  if (bestStarter !== -1) {
    return bestStarter
  }

  const benchBest = (positions: readonly SkillPosition[]): number => {
    let best = -1
    let bestScore = Number.NEGATIVE_INFINITY
    let bestPoints = Number.NEGATIVE_INFINITY
    for (const position of positions) {
      const idx = headAvailable(context, context.skillByUpside[position], stamp, candidateIdx)
      if (idx === -1) {
        continue
      }
      const player = roomPool[idx] as RolloutPlayer
      const score = pool.upsideScores.get(player.playerId) ?? player.upsideScore ?? 0
      const points = player.points ?? 0
      if (
        best === -1 ||
        score > bestScore ||
        (score === bestScore && (points > bestPoints || (points === bestPoints && idx < best)))
      ) {
        best = idx
        bestScore = score
        bestPoints = points
      }
    }
    return best
  }
  const capped = benchBest(openPositions)
  return capped !== -1 ? capped : benchBest(SKILL_POSITIONS)
}

/** Greedy continuation from `cursor` through `myPicks`; mutates roster/counts, records takes. */
const runTail = (
  context: McContext,
  scenario: number,
  stamp: number,
  candidateIdx: number,
  roster: RolloutPlayer[],
  counts: Map<number, PositionCounts>,
  myPicks: readonly number[],
  cursor: number,
  roomTaken?: number[],
): void => {
  for (const myPick of myPicks) {
    if (skillCount(roster) >= context.skillRounds) {
      break
    }
    for (let overall = cursor; overall < myPick; overall += 1) {
      const idx = sampleRoomPick(context, overall, scenario, stamp, candidateIdx, counts)
      if (idx !== -1) {
        roomTaken?.push(idx)
      }
    }
    const choiceIdx = chooseMine(context, roster, stamp, candidateIdx)
    if (choiceIdx !== -1) {
      roster.push(context.roomPool[choiceIdx] as RolloutPlayer)
      context.takenStamp[choiceIdx] = stamp
    }
    cursor = myPick + 1
  }
}

interface ScenarioResult {
  total: number
  slot: LineupSlot
  /** roomPool indexes the room removed (the winning branch's path under one-ply). */
  roomTaken: number[]
}

/**
 * One sampled rollout: the candidate taken now, my later turns greedy — except, under
 * 'one-ply', my next pick branches exhaustively over the slate (greedy after) and the best
 * branch counts. Branches share the scenario's counter-based draws, so their rooms are
 * maximally coupled too.
 */
/** The one-ply branch set at my next pick: indexes still on the board this scenario. */
const branchSet = (context: McContext, stamp: number, candidateIdx: number, greedyIdx: number): number[] => {
  const branches: number[] = []
  const add = (idx: number): void => {
    if (idx !== -1 && idx !== candidateIdx && context.takenStamp[idx] !== stamp && !branches.includes(idx)) {
      branches.push(idx)
    }
  }
  if (context.branchMode === 'slate') {
    for (const idx of context.slateIdxs) {
      add(idx)
    }
  } else {
    // position-tops: within a position, only the points-tops (starter case) or the upside top
    // (bench case) can win a greedy-tail comparison; two points-tops cover the taken-next case.
    for (const position of SKILL_POSITIONS) {
      let found = 0
      for (const idx of context.skillByPoints[position]) {
        if (context.takenStamp[idx] !== stamp && idx !== candidateIdx) {
          add(idx)
          found += 1
          if (found >= 2) {
            break
          }
        }
      }
      add(headAvailable(context, context.skillByUpside[position], stamp, candidateIdx))
    }
  }
  add(greedyIdx)
  return branches
}

const runScenario = (
  context: McContext,
  candidate: RolloutPlayer,
  candidateIdx: number,
  scenario: number,
): ScenarioResult => {
  const { pool } = context
  const lineupSlots = pool.settings.lineupSlots
  const roster = [...context.myRoster, candidate]
  const counts = cloneCounts(context.seedCounts)
  const stamp = (context.stampCounter += 1)
  const roomTaken: number[] = []

  const finalize = (finalRoster: RolloutPlayer[]): ScenarioResult => ({
    total: fastStarterTotal(context.lineup, finalRoster),
    slot: bestLineup(finalRoster, lineupSlots).slotByPlayer.get(candidate.playerId) ?? 'BENCH',
    roomTaken,
  })

  const firstPick = context.myPicks[0]
  if (firstPick === undefined || !context.onePly || skillCount(roster) >= context.skillRounds) {
    runTail(context, scenario, stamp, candidateIdx, roster, counts, context.myPicks, context.fromOverall, roomTaken)
    return finalize(roster)
  }

  // Room up to my next pick, shared by every branch.
  for (let overall = context.fromOverall; overall < firstPick; overall += 1) {
    const idx = sampleRoomPick(context, overall, scenario, stamp, candidateIdx, counts)
    if (idx !== -1) {
      roomTaken.push(idx)
    }
  }
  const laterPicks = context.myPicks.slice(1)
  const greedyIdx = chooseMine(context, roster, stamp, candidateIdx)
  const branches = branchSet(context, stamp, candidateIdx, greedyIdx)
  if (branches.length === 0) {
    runTail(context, scenario, stamp, candidateIdx, roster, counts, laterPicks, firstPick + 1, roomTaken)
    return finalize(roster)
  }

  let best: { roster: RolloutPlayer[]; roomTaken: number[]; total: number } | null = null
  for (const branchIdx of branches) {
    const branchStamp = (context.stampCounter += 1)
    for (const idx of roomTaken) {
      context.takenStamp[idx] = branchStamp
    }
    context.takenStamp[branchIdx] = branchStamp
    const branchRoster = [...roster, context.roomPool[branchIdx] as RolloutPlayer]
    const branchCounts = cloneCounts(counts)
    const branchRoom: number[] = []
    runTail(
      context,
      scenario,
      branchStamp,
      candidateIdx,
      branchRoster,
      branchCounts,
      laterPicks,
      firstPick + 1,
      branchRoom,
    )
    const total = fastStarterTotal(context.lineup, branchRoster)
    if (best === null || total > best.total) {
      best = { roster: branchRoster, roomTaken: branchRoom, total }
    }
  }
  roomTaken.push(...(best as { roomTaken: number[] }).roomTaken)
  return finalize((best as { roster: RolloutPlayer[] }).roster)
}

/** Everything per-evaluation the scenario loops share; built once, then read-only. */
const buildContext = (
  state: BoardState,
  options: EvaluateMCOptions,
): { context: McContext; candidateIds: PlayerId[] } => {
  const pool = buildPool(state, options)
  const profiles = options.profiles ?? null
  const pickOrder = state.settings.draft.pickOrder
  const teams = state.settings.size
  const fromOverall = state.draftedPlayerIds.length + 2 // the pick after the one on the clock
  const myIds = state.myDraftedPlayerIds ?? []
  const heldIds = new Set(myIds)
  const myRoster: RolloutPlayer[] = []
  for (const id of myIds) {
    const player = pool.byId.get(id)
    if (player !== undefined) {
      myRoster.push(player)
    }
  }
  const myPicks = overallPicksForSlot(state.myDraftSlot, teams, pool.totalRounds).filter((pick) => pick >= fromOverall)
  const roomPool = pool.all
    .filter(
      (player) =>
        !pool.drafted.has(player.playerId) && !pool.bannedIds.has(player.playerId) && !heldIds.has(player.playerId),
    )
    .sort(compareByRoomAdp)
  const indexByPlayer = new Map(roomPool.map((player, idx) => [player.playerId, idx]))
  const candidateIds = candidateSlate(pool, heldIds, options)

  const skillByPoints = {} as Record<SkillPosition, Int32Array>
  const skillByUpside = {} as Record<SkillPosition, Int32Array>
  for (const position of SKILL_POSITIONS) {
    const indexes: number[] = []
    roomPool.forEach((player, idx) => {
      if (player.position === position && player.points !== null) {
        indexes.push(idx)
      }
    })
    const points = (idx: number): number => (roomPool[idx] as RolloutPlayer).points ?? 0
    const upside = (idx: number): number => {
      const player = roomPool[idx] as RolloutPlayer
      return pool.upsideScores.get(player.playerId) ?? player.upsideScore ?? 0
    }
    skillByPoints[position] = Int32Array.from([...indexes].sort((a, b) => points(b) - points(a) || a - b))
    skillByUpside[position] = Int32Array.from(
      [...indexes].sort((a, b) => upside(b) - upside(a) || points(b) - points(a) || a - b),
    )
  }

  const tables = new Map<number, PickTable>()
  const myPickSet = new Set(myPicks)
  const lastMyPick = myPicks[myPicks.length - 1] ?? fromOverall
  let maxCount = 1
  for (let overall = fromOverall; overall < lastMyPick; overall += 1) {
    if (myPickSet.has(overall)) {
      continue
    }
    const loyalty = profiles?.teams.get(teamAtPick(pickOrder, overall))?.loyalty
    const hazards = roomPool.map((player) =>
      player.roomAdp === null ? 0 : pickHazardWeight(profiles, pickOrder, overall, player),
    )
    const cutoff = hazards.reduce((sum, hazard) => sum + hazard, 0) * HAZARD_CUTOFF_RATIO
    const playerIdx: number[] = []
    const weight: number[] = []
    const posIdx: number[] = []
    roomPool.forEach((player, idx) => {
      const hazard = hazards[idx] as number
      if (hazard <= cutoff) {
        return
      }
      playerIdx.push(idx)
      weight.push(hazard * (loyalty?.get(player.playerId)?.strength ?? 1))
      posIdx.push(POSITION_INDEX.get(player.position) ?? 0)
    })
    const cdf = new Float64Array(weight.length)
    let total = 0
    weight.forEach((value, i) => {
      total += value
      cdf[i] = total
    })
    tables.set(overall, {
      count: playerIdx.length,
      playerIdx: Int32Array.from(playerIdx),
      weight: Float64Array.from(weight),
      posIdx: Uint8Array.from(posIdx),
      cdf,
      total,
    })
    maxCount = Math.max(maxCount, playerIdx.length)
  }

  return {
    candidateIds,
    context: {
      pool,
      profiles,
      pickOrder,
      teams,
      fromOverall,
      myPicks,
      seedCounts: livePositionCounts(state),
      roomPool,
      tables,
      myRoster,
      indexByPlayer,
      skillByPoints,
      skillByUpside,
      slateIdxs: Int32Array.from(candidateIds.flatMap((id) => indexByPlayer.get(id) ?? [])),
      skillRounds: pool.skillRounds,
      seed: (options.seed ?? MC_DEFAULT_SEED) >>> 0,
      onePly: (options.continuation ?? 'one-ply') === 'one-ply',
      branchMode: options.branch ?? 'position-tops',
      lineup: makeLineupSpec(pool),
      takenStamp: new Int32Array(roomPool.length).fill(-1),
      stampCounter: 0,
      scratch: new Float64Array(maxCount),
      multMemo: new Map(),
      drawCache: new Map(),
    },
  }
}

const sampleStd = (values: Float64Array, mean: number): number => {
  if (values.length < 2) {
    return 0
  }
  let sum = 0
  for (const value of values) {
    sum += (value - mean) * (value - mean)
  }
  return Math.sqrt(sum / (values.length - 1))
}

/** Slot display order used only to break landsOn modal-count ties deterministically. */
const SLOT_ORDER: LineupSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH', 'IR']

const modalSlot = (tallies: Map<LineupSlot, number>): LineupSlot => {
  let best: LineupSlot = 'BENCH'
  let bestCount = -1
  for (const slot of SLOT_ORDER) {
    const count = tallies.get(slot) ?? 0
    if (count > bestCount) {
      best = slot
      bestCount = count
    }
  }
  return best
}

/**
 * The evaluation body as a generator so the sync and async drivers share it: one step per
 * candidate (K scenarios), so the async driver can yield the event loop between candidates.
 */
function* mcSteps(state: BoardState, options: EvaluateMCOptions): Generator<void, McCandidateEvaluation[], void> {
  const samples = Math.max(1, Math.floor(options.samples ?? MC_DEFAULT_SAMPLES))
  const { context, candidateIds } = buildContext(state, options)
  const { pool } = context

  const candidates: { player: RolloutPlayer; totals: Float64Array; slots: Map<LineupSlot, number> }[] = []
  for (const id of candidateIds) {
    const player = pool.byId.get(id)
    if (player === undefined) {
      continue
    }
    const candidateIdx = context.indexByPlayer.get(id) ?? -1
    const totals = new Float64Array(samples)
    const slots = new Map<LineupSlot, number>()
    for (let scenario = 0; scenario < samples; scenario += 1) {
      const result = runScenario(context, player, candidateIdx, scenario)
      totals[scenario] = result.total
      slots.set(result.slot, (slots.get(result.slot) ?? 0) + 1)
      options.instrument?.(
        id,
        scenario,
        result.roomTaken.map((idx) => (context.roomPool[idx] as RolloutPlayer).playerId),
      )
    }
    candidates.push({ player, totals, slots })
    yield
  }

  const means = candidates.map(({ totals }) => {
    let sum = 0
    for (const total of totals) {
      sum += total
    }
    return sum / samples
  })
  let bestIndex = 0
  for (let i = 1; i < candidates.length; i += 1) {
    if ((means[i] as number) > (means[bestIndex] as number)) {
      bestIndex = i
    }
  }
  // Pre-registered reference: the top-VOR candidate — chosen by inputs, not by the estimates.
  let refIndex = 0
  for (let i = 1; i < candidates.length; i += 1) {
    const vor = (candidates[i] as (typeof candidates)[number]).player.vor ?? Number.NEGATIVE_INFINITY
    const refVor = (candidates[refIndex] as (typeof candidates)[number]).player.vor ?? Number.NEGATIVE_INFINITY
    if (vor > refVor) {
      refIndex = i
    }
  }
  // pBest with exact ties split 1/m, so tied slates read as a distribution, not m sure things.
  const wins = new Array<number>(candidates.length).fill(0)
  const winners: number[] = []
  for (let scenario = 0; scenario < samples; scenario += 1) {
    let max = Number.NEGATIVE_INFINITY
    for (const { totals } of candidates) {
      max = Math.max(max, totals[scenario] as number)
    }
    winners.length = 0
    candidates.forEach(({ totals }, i) => {
      if (totals[scenario] === max) {
        winners.push(i)
      }
    })
    for (const i of winners) {
      wins[i] = (wins[i] as number) + 1 / winners.length
    }
  }
  // Exact-tie cardinality: candidates whose whole scenario vector is bit-identical.
  const tieGroups = new Map<string, number>()
  const tieKeys = candidates.map(({ totals }) => {
    const key = totals.join(',')
    tieGroups.set(key, (tieGroups.get(key) ?? 0) + 1)
    return key
  })

  const bestTotals = candidates[bestIndex]?.totals ?? new Float64Array(0)
  const bestMean = means[bestIndex] ?? 0
  const refMean = means[refIndex] ?? 0
  const evaluations = candidates.map(({ player, totals, slots }, index): McCandidateEvaluation => {
    const mean = means[index] as number
    const deltas = new Float64Array(samples)
    for (let scenario = 0; scenario < samples; scenario += 1) {
      deltas[scenario] = (totals[scenario] as number) - (bestTotals[scenario] as number)
    }
    return {
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      points: player.points,
      vor: player.vor,
      estTeamScore: mean,
      captureRatio: captureRatio(mean, pool.benchmarks),
      deltaVsBest: mean - bestMean,
      deltaVsRef: mean - refMean,
      landsOn: modalSlot(slots),
      upsideScore: player.upsideScore,
      se: sampleStd(totals, mean) / Math.sqrt(samples),
      deltaSe: index === bestIndex ? 0 : sampleStd(deltas, mean - bestMean) / Math.sqrt(samples),
      pBest: (wins[index] as number) / samples,
      exactTies: tieGroups.get(tieKeys[index] as string) ?? 1,
      samples,
    }
  })
  evaluations.sort((a, b) => b.estTeamScore - a.estTeamScore)
  return evaluations
}

/** Monte Carlo candidate evaluation, synchronous. See the module doc for the model. */
export const evaluateCandidatesMC = (state: BoardState, options: EvaluateMCOptions = {}): McCandidateEvaluation[] => {
  const steps = mcSteps(state, options)
  let step = steps.next()
  while (step.done !== true) {
    step = steps.next()
  }
  return step.value
}

/**
 * The same evaluation yielding the event loop between candidates (≈tens of ms per slice), so
 * a server can compute off the request path without a worker.
 */
export const evaluateCandidatesMCAsync = async (
  state: BoardState,
  options: EvaluateMCOptions = {},
): Promise<McCandidateEvaluation[] | null> => {
  const steps = mcSteps(state, options)
  // Yield before the first step too: setup + first candidate must not run on the caller's path.
  let step: IteratorResult<void, McCandidateEvaluation[]>
  do {
    await new Promise((resolve) => setImmediate(resolve))
    if (options.shouldAbort?.() === true) {
      return null // superseded — drop the work
    }
    step = steps.next()
  } while (step.done !== true)
  return step.value
}
