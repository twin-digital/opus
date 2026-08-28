# Ideas

Brainstorm queue — not commitments. Each entry: the idea, why it might matter, cheapest
version worth building.

## Room-delta leverage (ESPN vs market)

The room drafts off ESPN's board; we ingest both ESPN ADP and market/expert consensus. The
disagreement is large and exploitable: 54 of 141 draftable players differ by ≥ a full round,
extremes 3–6 rounds (measured 2026-08-27: Mike Evans ESPN 94 / market 61 / ECR 60; Travis
Hunter ESPN 121 / market 167 / ECR 190; ESPN systematically hypes QBs).

- Hyped (ESPN ≪ market): the room takes them earlier than market ADP predicts — never
  reachable at market price; don't plan around them.
- Buried (ESPN ≫ market): the room lets them fall — deliberately defer them a round and
  harvest at the turn.
- Discipline rule: trust a read only when ECR sides with the market (two of three sources
  agree ESPN is the outlier). When the market is the outlier (Sleeper quirk), no edge.

Cheapest version: make-it-back odds conditioned on ESPN ADP (fallback market) instead of
market ADP — automates the exploit, no list to remember. Plus a signed "room Δ" board column.

## Option value of marginal picks (upside when VOR is flat)

When the VOR gap between the best available and a next-round replacement is small, the mean
stops being the right thing to maximize. A drafted player's payoff is asymmetric: if he busts,
he's cut and replaced at replacement level; if he hits, the upside is kept in full. The value
of a pick is closer to E[max(outcome, replacement)] than E[outcome] — downside truncated,
upside unbounded. High-variance players are therefore worth more than their point estimate
says, and the premium grows as the VOR margin shrinks (late rounds: variance is nearly all
that matters; early rounds: floor still rules because the truncation point is far below the
mean).

Corollary: bench picks should be scored almost purely on ceiling probability, not mean —
a 25th-percentile bench outcome and a 45th-percentile one are both cuts.

Cheap proxies available without the historical uncertainty layer:

- FP `rank_min` vs `rank_ecr`: an expert ranking a player far above consensus is an
  articulated ceiling scenario; the spread is a free ceiling signal.
- FP `rank_std`: expert disagreement = wide outcome distribution.
- Source disagreement: |Sleeper − ESPN| projected points.
- Age/experience archetype: year-2/3 WRs fat right tail; aging RBs fat left tail.

Cheapest version: an "upside score" from those proxies, shown as its own column; sort late
rounds by upside instead of VOR. Full version (post-draft): empirical projection-error
distributions by position/archetype from nflverse backtests → real floor/ceiling percentiles →
E[max(outcome, replacement)] directly.

## Cost of waiting (cross-round positional cliffs)

The current pick is the wrong unit of optimization — the objective is the sum over all
remaining picks. If RB-now beats WR-now by 10, but by my next pick RB drops only 3 while WR
drops 25, taking the "worse" WR wins the sequence by 22. Decision rule: per position, cost of
waiting = (best available now) − (expected best available at my next pick); draft the
steepest position, not the highest VOR. A cliff is high cost-of-waiting; a smooth ramp is low.

All ingredients exist: expected-best-at-pick-N = walk the position's VOR list weighted by
survival odds. This personalizes cliffs to the slot (slot 11's gaps are lumpy — a cliff at
pick 20 is invisible, one at pick 40 is everything) and composes with room-delta (odds off
ESPN's board = cliffs measured against this room). Caveat: lookahead amplifies survival-model
error — greedy fails softly, planners fail confidently — so the informational version is the
draft-day one.

- Cheapest: per-position cost-of-waiting readout for my next two picks (status bar).
- One-step lookahead: recommend max of (player now + expected best complement next pick).
- Full (post-draft): DP/Monte Carlo over remaining picks × roster slots → true E[total roster].

## Rollout: est. final team score per candidate pick

The planner ideas materialized as one number per board row: "if I take him now, what does my
final starter total project to?" Rollout: candidate taken at current pick → room removes
players in room-behavior order (survival model; room-delta plugs in here) → my future picks
greedily take best VOR filling a starting slot → sum projected starters. Sort the board by it
while on the clock.

- Deltas between candidates subsume cost-of-waiting: the cliff math happens inside the sim.
- Absolute value calibrates against the measured range (replacement 1206 / realistic slot-11
  greedy 1526 / ceiling 2017 season pts; the whole draft edge is ~320 pts, so a 25-pt cliff
  is ~8% of it). Capture ratio = (team − replacement)/(ceiling − replacement) is the same
  number as a percentage — a live draft grade.
- Bench-bound candidates don't move the starter total: switch their metric to the upside
  score (option-value entry) — bench seats are lottery tickets, show P(matters) not a mean.
- Rollout must be need-aware, not pure VOR: the greedy sim hoarded six bench TEs and started
  a replacement-grade WR2 (measured) — the exact failure the roster-need parking-lot entry
  names.
- Caveat: deterministic rollout is the mean path; absolutes carry false confidence, deltas
  are the trustworthy part. Display comparisons prominently, absolutes ambiently.
- Cheap: one rollout is a pass over ~200 players × 14 rounds; recompute per poll tick.

## Source roles and aggregation policy

The three projection sources are not three interchangeable experts (Sleeper = Rotowire, one
independent shop; ESPN = the platform the room drafts on; FantasyPros = an aggregate of ~110
experts that likely already includes ESPN). Policy: FP anchors; the others shrink it, never
outvote it. A median-of-3 would let two correlated sources drag consensus across a confident
110-expert aggregate while ignoring deviation magnitude — instead:
consensus = FP + k·(debiased_mean(sleeper·1.0, espn·0.5) − FP), k ∈ ~[0.05, 0.35] scaled by
FP's own published dispersion (rank_std: panel tight → barely move; panel torn + both
deviators on the same side → move meaningfully). ESPN's half-weight reflects its partial
inclusion in FP. Debiasing is relative/rank-band, not a flat offset — the measured divergence
is a spread difference concentrated at the top of each position, not a location shift.
Limits: rank_std is rank-level dispersion applied to points (proxy), weights are priors not
estimates; calibrating k against outcomes is the post-draft historical layer's job.
The debiased residual spread
feeds the CONTESTED flag and the upside blend — one 3-component upside score that both the
display and the rollout's own decisions (bench picks, the slate's upside lane) use.
ESPN is ingested for the room model regardless of estimator quality; Sleeper is the only
truly independent voice and the only deep-coverage one (~3,100 players vs a few hundred).

## Parking lot

- Boost/ban list: manual override lane (late-breaking injury news, "my guys", never-draft).
- Roster-need weighting: late-draft sort = VOR × remaining-need multiplier.
- Opponent modeling: predict each team's next pick from their roster gaps + ESPN board;
  sharpens make-it-back beyond ADP alone.
- Bye-collision penalty as points, not just a warning.
- σ calibration for odds: home rooms are sloppier than mock lobbies; fatten σ.
