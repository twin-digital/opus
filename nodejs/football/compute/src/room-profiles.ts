import { readFileSync } from 'node:fs'

import { isPosition, type Player, type PlayerId, type Position } from '@twin-digital/football-data'

import { normalCdf, sigmaForPick } from './draft-math.js'

/**
 * Per-team opponent profiles mined from league draft history (design/room-rules.json). The
 * model answers one question: given a team on the clock at an overall pick, what is the
 * probability it takes each available player?
 *
 * Take weight for player i at pick p by team t:
 *
 *     w_i = hazard_i(p) × posMult(t, round(p), pos_i) × loyalty(t, i) × need(t, pos_i)
 *     takeProbability_i = w_i / Σ_available w_j
 *
 * need comes from the team's actual takes so far (live picks, plus simulated ones inside a
 * rollout): filled position blocks suppress, late starter gaps boost, and a pos-boost spends
 * on the team's first take of the position (ROOM_NEED). Without count data need is 1.
 *
 * hazard is the Normal(roomAdp_i, σ) pick density conditioned on the player still being
 * available — φ((p − adp)/σ)/σ divided by survival to p — so a player who has outlived his ADP
 * is picked up promptly rather than falling forever. The normalization makes takeProbability a
 * categorical distribution over the available pool: the team takes exactly one available player
 * at the pick, and probabilities sum to 1 for a given (team, pick, pool).
 *
 * σ per player is the base sigmaForPick curve, scaled by teamSigma/8 when the team has a
 * measured early-round σ (8 = the league's measured flat early σ, see room-profile.md), so a
 * tight drafter stays tight in late rounds without a flat σ degenerating there. A team's
 * sigmaScale multiplies the result — a confidence knob (> 1 flattens) for owners whose
 * standings suggest an elevated chance of deliberate behavior change.
 */

// -- types ------------------------------------------------------------------

export interface PosRule {
  kind: 'pos-boost' | 'pos-suppress'
  position: Position
  /** Inclusive round range the multiplier covers. */
  rounds: [number, number]
  strength: number
  /** Human-readable historical evidence, for tooltips; null for defaults without one. */
  evidence: string | null
}

export interface LoyaltyRule {
  playerId: PlayerId
  playerName: string
  strength: number
  evidence: string | null
}

export interface TeamProfile {
  teamId: number
  owner: string | null
  /** Measured early-round σ; null = base sigmaForPick model. */
  sigma: number | null
  /** Confidence multiplier on the σ curve (1 = as measured); > 1 flattens the distribution. */
  sigmaScale: number
  posRules: PosRule[]
  loyalty: Map<PlayerId, LoyaltyRule>
}

export interface RoomProfiles {
  teams: Map<number, TeamProfile>
  /** League-wide rules (K/DST timing); a team rule for the same position wins in its rounds. */
  defaults: PosRule[]
  /** Non-fatal load problems (unresolvable loyalty names). */
  warnings: string[]
}

/** The slice of a pool row the model needs; RolloutPlayer and BoardRow both satisfy it. */
export interface TakeCandidate {
  playerId: PlayerId
  position: Position
  roomAdp: number | null
}

// -- loader -----------------------------------------------------------------

/** League flat early-round σ (room-profile.md): the anchor a team σ is scaled against. */
export const LEAGUE_FLAT_SIGMA = 8

interface RawRule {
  kind?: unknown
  position?: unknown
  rounds?: unknown
  strength?: unknown
  playerName?: unknown
}

interface RawTeam {
  teamId?: unknown
  owner?: unknown
  sigma?: unknown
  sigmaScale?: unknown
  rules?: unknown
  evidence?: unknown
}

const asEvidence = (evidence: unknown, index: number): string | null => {
  if (evidence === undefined || evidence === null) {
    return null
  }
  const value = (evidence as Record<string, unknown>)[String(index)]
  return typeof value === 'string' ? value : null
}

const parsePosRule = (raw: RawRule, where: string, evidence: string | null): PosRule => {
  if (typeof raw.position !== 'string' || !isPosition(raw.position)) {
    throw new Error(`${where}: pos rule needs a valid position, got ${JSON.stringify(raw.position)}`)
  }
  if (
    !Array.isArray(raw.rounds) ||
    raw.rounds.length !== 2 ||
    raw.rounds.some((round) => typeof round !== 'number' || !Number.isInteger(round) || round < 1) ||
    (raw.rounds[0] as number) > (raw.rounds[1] as number)
  ) {
    throw new Error(`${where}: pos rule needs rounds [from, to] with 1 <= from <= to`)
  }
  if (typeof raw.strength !== 'number' || !Number.isFinite(raw.strength) || raw.strength <= 0) {
    throw new Error(`${where}: pos rule needs a positive finite strength`)
  }
  return {
    kind: raw.kind as 'pos-boost' | 'pos-suppress',
    position: raw.position,
    rounds: [raw.rounds[0] as number, raw.rounds[1] as number],
    strength: raw.strength,
    evidence,
  }
}

/**
 * Validate a parsed room-rules document and resolve loyalty player names against the player
 * table. Structural problems throw; an unresolvable or ambiguous loyalty name warns and skips —
 * the draft must never be blocked by a renamed player.
 */
export const resolveRoomRules = (
  spec: unknown,
  players: Pick<Player, 'id' | 'name'>[],
  warn: (message: string) => void = () => undefined,
): RoomProfiles => {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error('room rules must be a JSON object')
  }
  const doc = spec as { defaults?: { rules?: unknown; evidence?: unknown }; teams?: unknown }
  if (typeof doc.teams !== 'object' || doc.teams === null) {
    throw new Error('room rules need a `teams` object keyed by teamId')
  }

  const byName = new Map<string, PlayerId[]>()
  for (const player of players) {
    const key = player.name.toLowerCase()
    const list = byName.get(key)
    if (list === undefined) {
      byName.set(key, [player.id])
    } else {
      list.push(player.id)
    }
  }

  const warnings: string[] = []
  const emit = (message: string): void => {
    warnings.push(message)
    warn(message)
  }

  const defaults: PosRule[] = []
  const defaultRules = (doc.defaults?.rules ?? []) as unknown
  if (!Array.isArray(defaultRules)) {
    throw new Error('room rules `defaults.rules` must be an array')
  }
  defaultRules.forEach((raw: RawRule, index) => {
    if (raw.kind !== 'pos-boost' && raw.kind !== 'pos-suppress') {
      throw new Error(`defaults rule ${String(index)}: kind must be pos-boost or pos-suppress`)
    }
    defaults.push(parsePosRule(raw, `defaults rule ${String(index)}`, asEvidence(doc.defaults?.evidence, index)))
  })

  const teams = new Map<number, TeamProfile>()
  for (const [key, value] of Object.entries(doc.teams)) {
    const teamId = Number(key)
    if (!Number.isInteger(teamId)) {
      throw new Error(`room rules team key is not a teamId: ${key}`)
    }
    const raw = value as RawTeam
    if (raw.sigma !== null && (typeof raw.sigma !== 'number' || !Number.isFinite(raw.sigma) || raw.sigma <= 0)) {
      throw new Error(`team ${key}: sigma must be a positive number or null`)
    }
    if (
      raw.sigmaScale !== undefined &&
      (typeof raw.sigmaScale !== 'number' || !Number.isFinite(raw.sigmaScale) || raw.sigmaScale <= 0)
    ) {
      throw new Error(`team ${key}: sigmaScale must be a positive number when present`)
    }
    const rules = raw.rules ?? []
    if (!Array.isArray(rules)) {
      throw new Error(`team ${key}: rules must be an array`)
    }
    const posRules: PosRule[] = []
    const loyalty = new Map<PlayerId, LoyaltyRule>()
    rules.forEach((rule: RawRule, index) => {
      const where = `team ${key} rule ${String(index)}`
      const evidence = asEvidence(raw.evidence, index)
      if (rule.kind === 'pos-boost' || rule.kind === 'pos-suppress') {
        posRules.push(parsePosRule(rule, where, evidence))
        return
      }
      if (rule.kind !== 'loyalty') {
        throw new Error(`${where}: unknown rule kind ${JSON.stringify(rule.kind)}`)
      }
      if (typeof rule.playerName !== 'string' || rule.playerName.length === 0) {
        throw new Error(`${where}: loyalty rule needs a playerName`)
      }
      if (typeof rule.strength !== 'number' || !Number.isFinite(rule.strength) || rule.strength <= 0) {
        throw new Error(`${where}: loyalty rule needs a positive finite strength`)
      }
      const matches = byName.get(rule.playerName.toLowerCase()) ?? []
      if (matches.length !== 1) {
        emit(
          `${where}: loyalty player ${JSON.stringify(rule.playerName)} ${
            matches.length === 0 ? 'not found' : `is ambiguous (${matches.join(', ')})`
          } — rule skipped`,
        )
        return
      }
      loyalty.set(matches[0] as PlayerId, {
        playerId: matches[0] as PlayerId,
        playerName: rule.playerName,
        strength: rule.strength,
        evidence,
      })
    })
    teams.set(teamId, {
      teamId,
      owner: typeof raw.owner === 'string' ? raw.owner : null,
      sigma: raw.sigma,
      sigmaScale: raw.sigmaScale ?? 1,
      posRules,
      loyalty,
    })
  }

  return { teams, defaults, warnings }
}

/** Read and resolve a room-rules.json file. */
export const loadRoomRulesFile = (
  filePath: string,
  players: Pick<Player, 'id' | 'name'>[],
  warn?: (message: string) => void,
): RoomProfiles => resolveRoomRules(JSON.parse(readFileSync(filePath, 'utf8')), players, warn)

// -- the model --------------------------------------------------------------

/** teamId on the clock at an overall pick, from the round-1 pickOrder of a snake draft. */
export const teamAtPick = (pickOrder: number[], overall: number): number => {
  const teams = pickOrder.length
  const round = Math.ceil(overall / teams)
  const index = (overall - 1) % teams
  return (round % 2 === 1 ? pickOrder[index] : pickOrder[teams - 1 - index]) as number
}

const roundOfPick = (overall: number, teams: number): number => Math.ceil(overall / teams)

/** Keeps weights positive so normalization and argmax stay defined deep in the pool. */
const WEIGHT_FLOOR = 1e-12

// -- roster need ------------------------------------------------------------

/** A pick attributed to a team; positions drive the roster-need shaping. */
export interface TeamPositionPick {
  teamId: number
  position: Position
}

/** Per-position take counts for one team. */
export type PositionCounts = Map<Position, number>

/**
 * Roster-need knobs. FILLED is [count at which the seat block is realistically full, weight
 * multiplier once it is]: nobody carries a third QB/TE or a second K/DST, and a seventh RB/WR
 * is rare. From LATE_GAP_ROUND on, a team still missing a starter (STARTERS, the league's
 * lineup) reaches for it. Counts also spend pos-boosts: a boost fires for the team's first
 * take of the position only.
 */
export const ROOM_NEED = {
  FILLED: {
    QB: [2, 0.05],
    TE: [2, 0.05],
    K: [1, 0],
    DST: [1, 0],
    RB: [6, 0.3],
    WR: [6, 0.3],
  } as Record<Position, readonly [number, number]>,
  LATE_GAP_ROUND: 10,
  LATE_GAP_BOOST: 3,
  STARTERS: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 } as Record<Position, number>,
} as const

/** Fold picks-with-teamId into per-team position counts (the seed for need-aware models). */
export const countTeamPositions = (picks: TeamPositionPick[]): Map<number, PositionCounts> => {
  const counts = new Map<number, PositionCounts>()
  for (const pick of picks) {
    const team = counts.get(pick.teamId) ?? new Map<Position, number>()
    team.set(pick.position, (team.get(pick.position) ?? 0) + 1)
    counts.set(pick.teamId, team)
  }
  return counts
}

/** Need multiplier for one position given the team's take counts; 1 without count data. */
const needMult = (position: Position, round: number, counts: PositionCounts | undefined): number => {
  if (counts === undefined) {
    return 1
  }
  const count = counts.get(position) ?? 0
  const [cap, filledMult] = ROOM_NEED.FILLED[position]
  if (count >= cap) {
    return filledMult
  }
  if (round >= ROOM_NEED.LATE_GAP_ROUND && count < ROOM_NEED.STARTERS[position]) {
    return ROOM_NEED.LATE_GAP_BOOST
  }
  return 1
}

/**
 * Product of team rules matching (position, round); defaults fill positions no team rule covers
 * there. `counts` (the team's takes so far — live picks and/or simulated ones) spends pos-boost
 * rules: an owner reaches for his first TE, not his third.
 */
const posMult = (
  profile: TeamProfile | undefined,
  defaults: PosRule[],
  round: number,
  position: Position,
  counts?: PositionCounts,
): number => {
  let mult = 1
  let covered = false
  for (const rule of profile?.posRules ?? []) {
    if (rule.position === position) {
      if (rule.kind === 'pos-boost' && (counts?.get(position) ?? 0) > 0) {
        continue
      }
      if (rule.rounds[0] <= round && round <= rule.rounds[1]) {
        mult *= rule.strength
        covered = true
      }
    }
  }
  if (!covered) {
    for (const rule of defaults) {
      if (rule.position === position && rule.rounds[0] <= round && round <= rule.rounds[1]) {
        mult *= rule.strength
      }
    }
  }
  return mult
}

/** Normal(adp, σ) density at the pick, conditioned on the player still being available. */
const availabilityHazard = (overall: number, adp: number, sigma: number): number => {
  const z = (overall - adp) / sigma
  const density = Math.exp(-0.5 * z * z) / sigma
  const survival = Math.max(1 - normalCdf(overall - 0.5, adp, sigma), 1e-6)
  return density / survival
}

const takeWeight = (
  profiles: RoomProfiles | null,
  profile: TeamProfile | undefined,
  overall: number,
  round: number,
  player: TakeCandidate,
  counts?: PositionCounts,
): number => {
  let hazard = 0
  if (player.roomAdp !== null) {
    const base = sigmaForPick(player.roomAdp, null)
    const sigma =
      (profile?.sigma != null ? base * (profile.sigma / LEAGUE_FLAT_SIGMA) : base) * (profile?.sigmaScale ?? 1)
    hazard = availabilityHazard(overall, player.roomAdp, sigma)
  }
  const mult =
    profiles === null ? 1 : (
      posMult(profile, profiles.defaults, round, player.position, counts) *
      (profile?.loyalty.get(player.playerId)?.strength ?? 1) *
      needMult(player.position, round, counts)
    )
  return (hazard + WEIGHT_FLOOR) * mult
}

/**
 * The take distribution for the team on the clock at `overall`: takeProbability per available
 * player, summing to 1. `profiles: null` is the base model — pure Normal(roomAdp, σ) hazard,
 * no positional, loyalty, or need shaping. `counts` = the on-clock team's takes so far; it
 * spends that team's pos-boosts and applies the ROOM_NEED multipliers.
 *
 * `survival` (per-player P(still in the pool), from a depletion walk) scales each weight, so
 * the distribution is over the *expected* surviving pool: probability mass already spent at
 * earlier picks cannot be spent again. The returned probabilities are then unconditional take
 * masses at this pick, still summing to 1.
 */
export const takeDistribution = (
  profiles: RoomProfiles | null,
  pickOrder: number[],
  overall: number,
  available: TakeCandidate[],
  counts?: PositionCounts,
  survival?: Map<PlayerId, number>,
): Map<PlayerId, number> => {
  const profile = profiles?.teams.get(teamAtPick(pickOrder, overall))
  const round = roundOfPick(overall, pickOrder.length)
  const weights = available.map(
    (player) => takeWeight(profiles, profile, overall, round, player, counts) * (survival?.get(player.playerId) ?? 1),
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const distribution = new Map<PlayerId, number>()
  available.forEach((player, index) => {
    distribution.set(player.playerId, total > 0 ? (weights[index] as number) / total : 0)
  })
  return distribution
}

// -- expected-depletion walk ------------------------------------------------

export interface SurvivalWalkOptions {
  /** Picks by this teamId neither deplete nor count (my own turns are not opponent picks). */
  myTeamId?: number
  /** The draft's actual picks with teams; drives ROOM_NEED / pos-boost spending per team. */
  livePicks?: TeamPositionPick[]
  /** Picks to snapshot the survival map at (state *before* that pick is made). */
  snapshotAt?: number[]
  /**
   * Called per depleting pick with the take distribution (unconditional masses) and the
   * survival map as it stood before the pick. Read-only views — do not mutate.
   */
  onTake?: (pick: number, teamId: number, takes: Map<PlayerId, number>, survivalBefore: Map<PlayerId, number>) => void
}

export interface SurvivalWalkResult {
  /** P(still in the pool) per player after every walked pick (= at `toPick`). */
  survival: Map<PlayerId, number>
  /** Survival maps captured before each requested pick. */
  snapshots: Map<number, Map<PlayerId, number>>
}

/**
 * Sequential expected-depletion walk over picks `fromPick`..`toPick − 1`: per-player survival
 * s_i starts at 1; each opponent pick's take distribution is computed over the surviving pool
 * (weights × s_i, renormalized), its mass t_i accumulates as taken probability, and
 * s_i ← s_i − t_i. Each pick's distribution sums to 1, so total expected removals over N
 * opponent picks is exactly N — the walk cannot "take" the same player twice.
 */
export const walkPoolSurvival = (
  profiles: RoomProfiles | null,
  pickOrder: number[],
  fromPick: number,
  toPick: number,
  available: TakeCandidate[],
  options: SurvivalWalkOptions = {},
): SurvivalWalkResult => {
  const survival = new Map<PlayerId, number>()
  for (const player of available) {
    survival.set(player.playerId, 1)
  }
  const snapshots = new Map<number, Map<PlayerId, number>>()
  const snapshotAt = new Set(options.snapshotAt ?? [])
  const teamCounts = options.livePicks === undefined ? undefined : countTeamPositions(options.livePicks)

  for (let pick = fromPick; pick < toPick; pick += 1) {
    if (snapshotAt.has(pick)) {
      snapshots.set(pick, new Map(survival))
    }
    const teamId = teamAtPick(pickOrder, pick)
    if (options.myTeamId !== undefined && teamId === options.myTeamId) {
      continue
    }
    const takes = takeDistribution(profiles, pickOrder, pick, available, teamCounts?.get(teamId), survival)
    options.onTake?.(pick, teamId, takes, survival)
    for (const player of available) {
      const mass = takes.get(player.playerId) ?? 0
      survival.set(player.playerId, Math.max(0, (survival.get(player.playerId) ?? 1) - mass))
    }
  }
  if (snapshotAt.has(toPick)) {
    snapshots.set(toPick, new Map(survival))
  }
  return { survival, snapshots }
}

/** takeProbability for one player — the normalized weight over the available pool. */
export const takeProbability = (
  profiles: RoomProfiles | null,
  pickOrder: number[],
  overall: number,
  player: TakeCandidate,
  available: TakeCandidate[],
  counts?: PositionCounts,
): number => takeDistribution(profiles, pickOrder, overall, available, counts).get(player.playerId) ?? 0

/**
 * The team's mean-path pick: argmax take weight over the available pool (normalization cannot
 * change the argmax). Ties break toward lower roomAdp, then playerId, for determinism.
 * `counts` = this team's takes so far (live and/or simulated); spends boosts and applies need.
 */
export const argmaxTake = <T extends TakeCandidate>(
  profiles: RoomProfiles | null,
  pickOrder: number[],
  overall: number,
  available: T[],
  counts?: PositionCounts,
): T | null => {
  const profile = profiles?.teams.get(teamAtPick(pickOrder, overall))
  const round = roundOfPick(overall, pickOrder.length)
  let best: T | null = null
  let bestWeight = -1
  for (const player of available) {
    const weight = takeWeight(profiles, profile, overall, round, player, counts)
    if (
      best === null ||
      weight > bestWeight ||
      (weight === bestWeight &&
        ((player.roomAdp ?? Number.POSITIVE_INFINITY) < (best.roomAdp ?? Number.POSITIVE_INFINITY) ||
          ((player.roomAdp ?? Number.POSITIVE_INFINITY) === (best.roomAdp ?? Number.POSITIVE_INFINITY) &&
            player.playerId.localeCompare(best.playerId) < 0)))
    ) {
      best = player
      bestWeight = weight
    }
  }
  return best
}

// -- threats ----------------------------------------------------------------

export interface ThreatAttribution {
  teamId: number
  /** 1-based round-1 slot under the pickOrder passed in — display data, derived at call time. */
  slot: number | null
  ownerName: string | null
  /** The intervening pick contributing the largest take probability. */
  atPick: number
  /** Profiled takeProbability at that pick. */
  probability: number
  /** Evidence strings of the team rules that applied to this player at that pick. */
  evidence: string[]
}

export interface PlayerThreat {
  playerId: PlayerId
  /** My pick the survival runs to. */
  myPick: number
  /** Product over intervening picks of (1 − takeProbability) under the profiled model. */
  survivalToMyPick: number
  pTakenBeforeMyPick: number
  /**
   * 0 = under 25% taken; 1 = 25–50%; 2 = 50–75%; 3 = >75%. Probability alone sets the level —
   * attribution, when a named rule materially drives the threat, rides along at any level.
   */
  threatLevel: 0 | 1 | 2 | 3
  attribution: ThreatAttribution | null
}

export interface PickThreatsOptions {
  /** Picks by this teamId are skipped (my own turns are not threats). */
  myTeamId?: number
  /**
   * The draft's actual picks with their teams. Makes the profiled model roster-need-aware:
   * a team's filled positions are suppressed (ROOM_NEED), its pos-boosts spend on the first
   * take, and late starter gaps boost — so a QB-holding team stops threatening QBs. The base
   * model used for attribution gating stays need-free.
   */
  livePicks?: TeamPositionPick[]
}

/**
 * "Materially driven by a named rule": the profiled take probability at the attributed pick is
 * at least this multiple of the base model's, and at least ATTRIBUTION_MIN_FRACTION of the
 * round's hottest per-pick take probability. Below either bar the base model explains the
 * threat and no team is named, however high the aggregate probability. The absolute bar is
 * round-relative because per-pick take probabilities fall steeply with round: a fixed floor
 * tuned on round 1 silences every mid-round attribution.
 */
export const ATTRIBUTION_RATIO = 1.5
export const ATTRIBUTION_MIN_FRACTION = 0.15

/**
 * Survival odds for every available player from `currentOverall` (exclusive of my own picks)
 * to `myNextPick`, under the profiled room model, with attribution when a named rule materially
 * drives the threat.
 *
 * Runs on the expected-depletion walk (walkPoolSurvival): each intervening pick's distribution
 * is over the surviving pool, so N opponent picks remove exactly N players' worth of
 * probability mass and threat products stay honest across players.
 */
export const pickThreats = (
  profiles: RoomProfiles,
  pickOrder: number[],
  currentOverall: number,
  myNextPick: number,
  available: TakeCandidate[],
  options: PickThreatsOptions = {},
): Map<PlayerId, PlayerThreat> => {
  interface Contribution {
    pick: number
    teamId: number
    /** Conditional takeProbability at the pick, given the player survived to it. */
    probability: number
    baseProbability: number
    /** Unconditional mass: the pick's share of P(taken before my pick) — ranks contributions. */
    mass: number
  }
  const maxContribution = new Map<PlayerId, Contribution>()
  /** Hottest conditional take probability seen per round — the attribution floor's yardstick. */
  const roundMaxProbability = new Map<number, number>()

  const { survival } = walkPoolSurvival(profiles, pickOrder, currentOverall, myNextPick, available, {
    myTeamId: options.myTeamId,
    livePicks: options.livePicks,
    onTake: (pick, teamId, takes, survivalBefore) => {
      const base = takeDistribution(null, pickOrder, pick, available, undefined, survivalBefore)
      const round = roundOfPick(pick, pickOrder.length)
      for (const player of available) {
        const mass = takes.get(player.playerId) ?? 0
        const survivedTo = survivalBefore.get(player.playerId) ?? 1
        const probability = survivedTo > 0 ? Math.min(1, mass / survivedTo) : 0
        if (probability > (roundMaxProbability.get(round) ?? 0)) {
          roundMaxProbability.set(round, probability)
        }
        const current = maxContribution.get(player.playerId)
        if (current === undefined || mass > current.mass) {
          const baseMass = base.get(player.playerId) ?? 0
          maxContribution.set(player.playerId, {
            pick,
            teamId,
            probability,
            baseProbability: survivedTo > 0 ? Math.min(1, baseMass / survivedTo) : 0,
            mass,
          })
        }
      }
    },
  })

  const threats = new Map<PlayerId, PlayerThreat>()
  for (const player of available) {
    const survives = survival.get(player.playerId) ?? 1
    const taken = 1 - survives
    const contribution = maxContribution.get(player.playerId)

    let attribution: ThreatAttribution | null = null
    if (contribution !== undefined) {
      const profile = profiles.teams.get(contribution.teamId)
      const round = roundOfPick(contribution.pick, pickOrder.length)
      const evidence: string[] = []
      for (const rule of profile?.posRules ?? []) {
        if (rule.position === player.position && rule.rounds[0] <= round && round <= rule.rounds[1]) {
          if (rule.evidence !== null) {
            evidence.push(rule.evidence)
          }
        }
      }
      const loyaltyRule = profile?.loyalty.get(player.playerId)
      if (loyaltyRule?.evidence != null) {
        evidence.push(loyaltyRule.evidence)
      }
      const material =
        evidence.length > 0 &&
        contribution.probability >= ATTRIBUTION_MIN_FRACTION * (roundMaxProbability.get(round) ?? 0) &&
        contribution.probability >= ATTRIBUTION_RATIO * contribution.baseProbability
      if (material) {
        const slotIndex = pickOrder.indexOf(contribution.teamId)
        attribution = {
          teamId: contribution.teamId,
          slot: slotIndex === -1 ? null : slotIndex + 1,
          ownerName: profile?.owner ?? null,
          atPick: contribution.pick,
          probability: contribution.probability,
          evidence,
        }
      }
    }

    let threatLevel: 0 | 1 | 2 | 3 = 0
    if (taken > 0.75) {
      threatLevel = 3
    } else if (taken > 0.5) {
      threatLevel = 2
    } else if (taken >= 0.25) {
      threatLevel = 1
    }

    threats.set(player.playerId, {
      playerId: player.playerId,
      myPick: myNextPick,
      survivalToMyPick: survives,
      pTakenBeforeMyPick: taken,
      threatLevel,
      attribution,
    })
  }
  return threats
}
