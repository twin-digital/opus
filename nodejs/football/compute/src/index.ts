export { board, pickAdp } from './board.js'
export type { BoardOptions, BoardResult, BoardRow, BoardState } from './board.js'
export {
  buildConsensus,
  buildConsensusV2,
  type ConsensusContext,
  type ConsensusSignals,
  type ConsensusV2Result,
} from './consensus.js'
export { bandIndex, debiasSourcePoints, type DebiasFactors, type DebiasResult, type SourcePoints } from './debias.js'
export { TUNING } from './tuning.js'
export {
  availabilityAtPick,
  makeItBackOdds,
  makeItBackOddsForMarket,
  normalCdf,
  overallPicksForSlot,
  planningAdp,
  sigmaForPick,
  survivalAtPick,
  upcomingPicksForSlot,
  type AdpSource,
  type SurvivalOptions,
} from './draft-math.js'
export {
  applyOverrides,
  loadOverridesFile,
  resolveOverrides,
  type AppliedOverrides,
  type OverrideSpec,
  type PlayerOverride,
} from './overrides.js'
export { buildLeagueScorer, type LeagueScorer } from './rescore.js'
export {
  benchmarksForPool,
  captureRatio,
  chooseForRoster,
  computeBenchmarks,
  evaluateCandidates,
  rolloutFrom,
  simulateRoomSegment,
  type Benchmarks,
  type CandidateEvaluation,
  type EvaluateOptions,
  type RolloutOptions,
  type RolloutPlayer,
  type RolloutResult,
  type RosterState,
} from './rollout.js'
export { marketAdp, roomAdp, roomDelta, ESPN_UNDRAFTED_SENTINEL } from './room.js'
// -- strategy layer (sim/): scorers × policies over an immutable DraftState -------------
export { hashSeed, hashString, makeRng, mulberry32, normalSample, type Rng } from './sim/rng.js'
export {
  applyPick,
  availablePlayers,
  compareByRoomAdp,
  currentOverall,
  currentRound,
  isComplete,
  makeDraftState,
  makeSimPool,
  rosterIdsOf,
  rosterOf,
  runDraft,
  skillCountOf,
  skillRounds,
  snakePickOrder,
  teamOnClock,
  untilSeatSkillFull,
  type DraftPick,
  type DraftState,
  type DraftStateOptions,
  type PickPolicy,
  type SimPool,
  type SimPoolParts,
} from './sim/state.js'
export {
  adpPolicy,
  argmaxPolicy,
  forcedKdstPick,
  fullSkillSlate,
  marginalPolicy,
  noisyAdpPolicy,
  topVorSlate,
  type SlateBuilder,
} from './sim/policies.js'
export {
  completeDraft,
  marginalScorer,
  pointsScorer,
  recursiveScorer,
  rolloutScorer,
  rolloutValue,
  seatStarterTotal,
  vorScorer,
  type PickScorer,
  type RecursiveScorerOptions,
  type RolloutValue,
  type SimulatingScorerOptions,
} from './sim/scorers.js'
export {
  OUTCOME_SIGMA_FLOOR,
  OUTCOME_SIGMA_RATE,
  projectionFitness,
  realizedFitness,
  sampleRealizedPoints,
  type ProjectionFitness,
} from './sim/fitness.js'
export { buildSimPool, trimSimPool } from './sim/pool.js'
export { tournament, type TournamentOptions, type TrialResult } from './sim/tournament.js'
export {
  bestLineup,
  buildRoster,
  lineupTotalWithReplacement,
  type BestLineup,
  type ByeCollision,
  type LineupPlayer,
  type RosterPlayer,
  type RosterSlot,
  type RosterSummary,
} from './roster.js'
export { assignTiers, type TierOptions } from './tiers.js'
export { computeUpsideScores, isDraftable, upsideSignals, type UpsideSignals } from './upside.js'
export { computeReplacementLevels, valueOverReplacement, type ReplacementLevel, type ScoredPlayer } from './vor.js'
