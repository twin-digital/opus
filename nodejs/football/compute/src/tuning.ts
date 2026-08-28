/**
 * Every consensus/debias knob in one place. Sources measured 2026-08-28: Sleeper vs ESPN
 * matched-pool means agree within ~2 pts at QB/WR/TE (+9 RB), but ESPN runs 20–36 pts hotter
 * at the top of QB/RB/WR — a spread difference concentrated in the first rank band, hence
 * band factors rather than flat per-position offsets.
 */
export const TUNING = {
  /** Positional rank bands per source's own ordering: 1–12, 13–24, 25–36, 37+. */
  BAND_SIZE: 12,
  BAND_COUNT: 4,
  /** A band with fewer multi-source players than this keeps factor 1 (degenerate band). */
  MIN_BAND_PLAYERS: 4,
  /** Ratio samples need meaningful points on both sides; near-zero denominators explode. */
  MIN_BAND_POINTS: 20,
  /** Applied band factors stay within this range whatever the ratio samples say. */
  FACTOR_MIN: 0.8,
  FACTOR_MAX: 1.25,
  /** ESPN is likely already inside FP's ~110-expert panel, so it gets half a vote. */
  ESPN_WEIGHT: 0.5,
  /** Shrinkage k = clamp(K_BASE · normStd/STD_NORM_REF, K_MIN, K_MAX). */
  K_BASE: 0.2,
  K_MIN: 0.05,
  K_MAX: 0.35,
  /**
   * ecr.stdDev is rank-level dispersion and grows with rank, so it is normalized as
   * stdDev/sqrt(rank). 1.5 is the measured pool median of that ratio over the top-150 ECR
   * pool (2026-08-28) — the median-dispersion player gets exactly K_BASE.
   */
  STD_NORM_REF: 1.5,
  /** Debiased cross-source residual spread (league pts) at or above this flags CONTESTED. */
  CONTESTED_THRESHOLD: 30,
} as const
