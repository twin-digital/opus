/**
 * Draft-strategy tournament experiments. Loads the ingested snapshot, builds a trimmed
 * SimPool, and runs the four planned experiments (strategy ladder, robustness to room
 * noise, one-ply lookahead, seat sensitivity), persisting raw per-trial results as JSON
 * under compute/experiments/ so analyses re-run without re-simulating.
 *
 *   pnpm exec tsx src/cli/experiments.ts --exp all
 *   pnpm exec tsx src/cli/experiments.ts --exp 2 --scale 0.5   # halve trial counts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { openDatabase, Store } from '@twin-digital/football-data'

import type { BoardState } from '../board.js'
import { buildSimPool, trimSimPool } from '../sim/pool.js'
import { argmaxPolicy, noisyAdpPolicy, topVorSlate } from '../sim/policies.js'
import { marginalScorer, pointsScorer, recursiveScorer, rolloutScorer, vorScorer } from '../sim/scorers.js'
import type { PickPolicy, SimPool } from '../sim/state.js'
import { tournament, type TrialResult } from '../sim/tournament.js'

const packageDir = path.resolve(fileURLToPath(import.meta.url), '../../..')
const DEFAULT_DB = path.join(packageDir, '..', 'data', '.data', 'football.db')
const DEFAULT_OUT = path.join(packageDir, 'experiments')

/** One seed for the whole campaign: arms sharing (seed, trials) share room draws. */
const CAMPAIGN_SEED = 20260828

// -- stats ------------------------------------------------------------------

interface Stats {
  n: number
  mean: number
  std: number
  p10: number
  p50: number
  p90: number
}

const quantile = (sorted: number[], q: number): number => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return ((sorted[lo] as number) + (sorted[hi] as number)) / 2
}

const stats = (values: number[]): Stats => {
  const n = values.length
  const mean = values.reduce((sum, v) => sum + v, 0) / n
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, n - 1)
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n,
    mean,
    std: Math.sqrt(variance),
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  }
}

interface PairedDelta {
  arms: [string, string]
  metric: string
  meanDelta: number
  stdDelta: number
  winRate: number
}

const pairedDeltas = (
  a: { name: string; results: TrialResult[] },
  b: { name: string; results: TrialResult[] },
): PairedDelta[] =>
  (['starterTotal', 'realizedTotal'] as const).map((metric) => {
    const deltas = a.results.map((trial, i) => trial[metric] - (b.results[i] as TrialResult)[metric])
    const s = stats(deltas)
    return {
      arms: [a.name, b.name],
      metric,
      meanDelta: s.mean,
      stdDelta: s.std,
      winRate: deltas.filter((d) => d > 0).length / deltas.length,
    }
  })

// -- arms -------------------------------------------------------------------

interface Arm {
  name: string
  seatSlot: number
  fieldSigma: number
  trials: number
  seatPolicy: PickPolicy
  fieldPolicy: PickPolicy
}

interface ArmResult {
  name: string
  seatSlot: number
  fieldSigma: number
  trials: number
  runtimeSec: number
  summary: { starterTotal: Stats; captureRatio: Stats; realizedTotal: Stats }
  results: TrialResult[]
}

const runArm = (pool: SimPool, arm: Arm): ArmResult => {
  const started = Date.now()
  let lastLog = started
  const results = tournament({
    pool,
    seatSlot: arm.seatSlot,
    seatPolicy: arm.seatPolicy,
    fieldPolicy: arm.fieldPolicy,
    trials: arm.trials,
    seed: CAMPAIGN_SEED,
    onTrial: (done, total) => {
      const now = Date.now()
      if (now - lastLog > 15_000 || done === total) {
        console.error(
          `    ${arm.name}: ${String(done)}/${String(total)} trials, ${((now - started) / 1000).toFixed(0)}s elapsed`,
        )
        lastLog = now
      }
    },
  })
  const runtimeSec = (Date.now() - started) / 1000
  console.error(`  arm ${arm.name}: ${String(arm.trials)} trials in ${runtimeSec.toFixed(1)}s`)
  return {
    name: arm.name,
    seatSlot: arm.seatSlot,
    fieldSigma: arm.fieldSigma,
    trials: arm.trials,
    runtimeSec,
    summary: {
      starterTotal: stats(results.map((trial) => trial.starterTotal)),
      captureRatio: stats(results.map((trial) => trial.captureRatio)),
      realizedTotal: stats(results.map((trial) => trial.realizedTotal)),
    },
    results,
  }
}

// -- seat policies ----------------------------------------------------------

/** Simulating seats score a trimmed slate (top-16 VOR + top-2 per position) per pick. */
const ROLLOUT_SLATE = topVorSlate(16, 2)
const seatPolicies: Record<string, () => PickPolicy> = {
  points: () => argmaxPolicy(pointsScorer),
  vor: () => argmaxPolicy(vorScorer),
  marginal: () => argmaxPolicy(marginalScorer),
  rollout: () => argmaxPolicy(rolloutScorer(), ROLLOUT_SLATE),
  'recursive-4': () => argmaxPolicy(recursiveScorer({ depth: 4 }), topVorSlate(12, 2)),
}

// -- experiments ------------------------------------------------------------

interface ExperimentSpec {
  key: string
  file: string
  question: string
  arms: Arm[]
  /** Pairs to report paired deltas for; '*' = all vs all. */
  pairs: [string, string][] | '*'
}

const experiments = (scale: number): ExperimentSpec[] => {
  const n = (base: number): number => Math.max(4, Math.round(base * scale))
  const mk = (name: string, policy: string, slot: number, sigma: number, trials: number): Arm => ({
    name,
    seatSlot: slot,
    fieldSigma: sigma,
    trials,
    seatPolicy: (seatPolicies[policy] as () => PickPolicy)(),
    fieldPolicy: noisyAdpPolicy(sigma),
  })
  return [
    {
      key: '1',
      file: 'exp1-ladder.json',
      question: 'Strategy ladder: how big is each rung {points, vor, marginal, rollout} at slot 11?',
      arms: ['points', 'vor', 'marginal', 'rollout'].map((policy) => mk(policy, policy, 11, 1.0, n(500))),
      pairs: '*',
    },
    {
      key: '2',
      file: 'exp2-robustness.json',
      question:
        'Robustness: rollout models a deterministic-ADP room; does its edge over marginal survive noisier fields?',
      arms: [0.5, 1.0, 2.0].flatMap((sigma) => [
        mk(`rollout@sigma${String(sigma)}`, 'rollout', 11, sigma, n(400)),
        mk(`marginal@sigma${String(sigma)}`, 'marginal', 11, sigma, n(400)),
      ]),
      pairs: [
        ['rollout@sigma0.5', 'marginal@sigma0.5'],
        ['rollout@sigma1', 'marginal@sigma1'],
        ['rollout@sigma2', 'marginal@sigma2'],
      ],
    },
    {
      key: '3',
      file: 'exp3-depth.json',
      question: 'Depth: is one ply of lookahead at my next pick (recursive) worth anything over greedy rollout?',
      arms: [mk('rollout', 'rollout', 11, 1.0, n(300)), mk('recursive-4', 'recursive-4', 11, 1.0, n(300))],
      pairs: [['recursive-4', 'rollout']],
    },
    {
      key: '4',
      file: 'exp4-seat.json',
      question: 'Seat sensitivity: does the best strategy depend on the slot (turn vs middle)?',
      arms: [1, 6, 11].flatMap((slot) =>
        ['vor', 'marginal', 'rollout'].map((policy) => mk(`${policy}@slot${String(slot)}`, policy, slot, 1.0, n(300))),
      ),
      pairs: [1, 6, 11].flatMap((slot): [string, string][] => [
        [`rollout@slot${String(slot)}`, `marginal@slot${String(slot)}`],
        [`marginal@slot${String(slot)}`, `vor@slot${String(slot)}`],
      ]),
    },
  ]
}

// -- main -------------------------------------------------------------------

const main = (): void => {
  const { values } = parseArgs({
    options: {
      exp: { type: 'string', default: 'all' },
      db: { type: 'string', default: process.env.FOOTBALL_DB ?? DEFAULT_DB },
      season: { type: 'string', default: process.env.FOOTBALL_SEASON ?? '2026' },
      out: { type: 'string', default: DEFAULT_OUT },
      scale: { type: 'string', default: '1' },
    },
  })
  const season = Number(values.season)
  const scale = Number(values.scale)

  const store = new Store(openDatabase(values.db))
  const settings = store.getLeagueSettings()
  if (settings === null) {
    throw new Error(`no league_settings in ${values.db}`)
  }
  const state: BoardState = {
    settings,
    players: store.getPlayers(),
    projections: store.getProjections(season).filter((row) => row.source !== 'consensus'),
    market: store.getMarketData(),
    draftedPlayerIds: [],
    myDraftedPlayerIds: [],
    myDraftSlot: 11,
    season,
  }
  const fullPool = buildSimPool(state)
  const pool = trimSimPool(fullPool)
  console.error(
    `pool: ${String(pool.players.length)} players (trimmed from ${String(fullPool.players.length)}), ` +
      `${String(pool.teams)} teams × ${String(pool.rounds)} rounds; ` +
      `benchmarks ceiling ${pool.benchmarks.ceiling.toFixed(1)} / replacement ${pool.benchmarks.replacement.toFixed(1)}`,
  )

  mkdirSync(values.out, { recursive: true })
  const selected = experiments(scale).filter((spec) => values.exp === 'all' || values.exp === spec.key)
  for (const spec of selected) {
    console.error(`\nexperiment ${spec.key}: ${spec.question}`)
    const started = Date.now()
    const arms = spec.arms.map((arm) => runArm(pool, arm))
    const byName = new Map(arms.map((arm) => [arm.name, arm]))
    const pairs: [string, string][] =
      spec.pairs === '*' ?
        arms.flatMap((a, i) => arms.slice(i + 1).map((b): [string, string] => [a.name, b.name]))
      : spec.pairs
    const pairwise = pairs.flatMap(([a, b]) => {
      const armA = byName.get(a)
      const armB = byName.get(b)
      return armA !== undefined && armB?.trials === armA.trials ? pairedDeltas(armA, armB) : []
    })
    const payload = {
      experiment: spec.key,
      question: spec.question,
      seed: CAMPAIGN_SEED,
      season,
      generatedAt: new Date().toISOString(),
      runtimeSec: (Date.now() - started) / 1000,
      pool: {
        players: pool.players.length,
        teams: pool.teams,
        rounds: pool.rounds,
        benchmarks: pool.benchmarks,
      },
      playerIndex: Object.fromEntries(
        pool.players.map((player) => [
          player.playerId,
          { name: player.name, position: player.position, points: player.points, roomAdp: player.roomAdp },
        ]),
      ),
      arms,
      pairwise,
    }
    const file = path.join(values.out, spec.file)
    writeFileSync(file, JSON.stringify(payload, null, 2))
    console.error(`wrote ${file} (${payload.runtimeSec.toFixed(1)}s)`)
  }
}

main()
