# Monte Carlo candidate evaluation with common random numbers — methodology

As landed in `compute/src/mc-rollout.ts`. Sections marked **[vet]** are the assumptions we
most want challenged.

## 1. Problem

At a draft pick, choose among candidates c ∈ C (|C| ≈ 40–55, the shared `candidateSlate`).
The value of taking candidate c is a random variable V_c(ω), where ω is the randomness of the
remaining draft (which players the 11 opponents take, in what order). V_c is computed by
simulating the draft to completion and scoring the resulting roster's best legal starting
lineup — a nonlinear (max-assignment) function of the final roster.

Decision target: argmax_c E[V_c]. Secondary outputs: Δ̂ vs a pre-registered reference
(deltaVsRef, §4), and pBest_c = P(V_c = max_{c'} V_{c'}).

The deterministic engine evaluates V_c on the single modal path ω* (every opponent takes
their most-probable player). Because V is nonlinear, V_c(ω*) ≠ E[V_c(ω)]; an independent
review measured the bias at −11 to −24 points, candidate-specific, largest for players whose
ADP falls between the current and next own pick — large enough to reorder the
recommendation. The MC estimator replaces f(E[ω]) with E[f(ω)].

## 2. Randomness model

Opponent pick t (team τ(t), round r(t)) selects from the available pool with the profiled
`takeDistribution`: an availability-hazard kernel per player (Normal around roomADP with the
team's σ, floored at TUNING.SIGMA_FLOOR = 4.5), multiplied by per-team taste/loyalty factors
and dynamic roster-need multipliers, renormalized over the currently available pool. The room
model itself — σ calibration, need multipliers — is separately specced and is _conditioned
on_, not sampled, here. **[vet]** We sample only pick-order randomness; projection error and
room-model parameter uncertainty are NOT propagated (they enter the error budget instead,
§6). Justification: the decision compares candidates under a common projection set;
projection error is common-mode across candidates at the same position, less so across
positions.

My own future picks use the greedy marginal-starter-points policy (`chooseForRoster`),
sharpened by a **one-ply lookahead at my next pick** (the default `continuation: 'one-ply'`):
branch over the candidate slate there, greedy after, keep the best branch. This exists
because the greedy tail measurably distorts the _ranking at the current pick_, not just its
level. The decisive measurement (reference state, §7): under a pure greedy continuation the
top three order Cook / Allen / Henry; under one-ply they order Henry / Cook / Allen, with
one-ply uplifts of +23.4 (Henry), +12.2 (Cook), +1.6 (Allen) — candidate-DEPENDENT, so the
"greedy bias cancels in deltas" assumption is false for this room, and the recommendation
order depends on the one-ply correction. **[vet]** One-ply corrects the first tail decision only;
deeper tail suboptimality is assumed candidate-invariant. The branch set defaults to
'position-tops' (top-2 by points and top by upside per skill position, plus the greedy
choice); the exhaustive 'slate' branch is the reference definition at ~5× the cost.

## 3. Sampling scheme and CRN construction

K scenarios (default K = 300, seed fixed at 20260828). RNG is **counter-based**: every
uniform is a pure hash of (seed, scenario, team, round, drawIndex), finalized through one
mulberry step — bit-identical to `mulberry32(hashSeed(seed, scenario, teamId, round, draw))()`.
No sequential streams exist, so there is no stream-collision or call-order question, and a
pick coordinate can consume any number of draws (the rejection loop needs that). Same seed →
identical results.

- CRN: for a fixed scenario k, the SAME uniforms u(k, τ, r, j) drive every candidate arm.
  Keying by entity (team, round) rather than draw sequence avoids the classic CRN failure
  where removing one player shifts every subsequent draw and decorrelates the paths.
- Coupling: each opponent pick **rejection-samples** from the pick's static proposal
  (availability hazard × loyalty over the full pool, taken players included), redrawing on a
  hit of an unavailable player and thinning by the dynamic roster-need multiplier
  (accept with probability mult/maxMult — an exact draw from the dynamic
  `takeDistribution`). Proposal draws are identical across candidate arms, so two arms
  differing by one removed player diverge only where that player would genuinely have been
  picked — a **maximal coupling for the remove-one case**. Candidate deltas difference the
  shared room noise out. **[vet]** After the first divergence the arms' pools differ by more
  than one player and the coupling is no longer provably maximal; we rely on it for variance
  reduction, not correctness (the thinning keeps every arm exact regardless).
- A bounded rejection cap (200) falls back to an exact renormalized categorical draw keyed by
  the same pick coordinate, so exactness survives heavy pool depletion.

## 4. Estimators

Per candidate: V_c(k), k = 1..K under the shared scenarios.

- Mean: μ̂_c = (1/K) Σ_k V_c(k). Reported as EST TEAM.
- deltaVsRef: μ̂_c − μ̂_ref where **ref is the pre-registered top-VOR candidate in the
  slate**, chosen before any estimate is seen — unlike a delta against the empirical best it
  carries no winner's-curse bias, so it is the primary reported delta. deltaSe is the paired
  se of the per-scenario difference against the top-mean candidate: CRN drives
  Cov(V_c, V_b) high, so paired se ≪ unpaired.
- pBest_c = (1/K) Σ_k [win share in scenario k], where an exact m-way tie in a scenario
  splits the win 1/m — pBest stays a distribution (Σ_c pBest_c = 1). `exactTies` reports the
  number of candidates whose per-scenario totals are all bit-identical, and the UI marks them
  (≡) so a split share is not misread as a weak candidate.
- se(μ̂_c) = sd_k(V_c(k)) / √K, reported per candidate.

## 5. Choice of K

K = 300 fixed (no sequential stopping). Measured at the reference state: se(μ̂) ≈ 0.65–0.72,
paired delta se ≈ 0.5 — far inside every displayed band. Timing ≈ 16 s per evaluation on the
draft box, computed off the request path (the UI serves the last completed payload marked
`computing` until the refresh lands). K is configurable (FOOTBALL_EVAL_K); budget allows
K ≈ 1000.

## 6. Error budget

What the MC engine fixes, and what it deliberately does not:

| Error source                     | Size (measured)                    | Status                  |
| -------------------------------- | ---------------------------------- | ----------------------- |
| Sampling noise, absolute         | se ≈ 0.65 at K = 300               | reported per candidate  |
| Sampling noise, paired deltas    | se ≈ 0.5 at K = 300                | reported (deltaSe)      |
| Jensen bias of the modal path    | −11 to −24 pts                     | fixed by MC integration |
| Greedy-continuation ranking bias | up to ~23 pts, candidate-dependent | fixed by one-ply (§2)   |
| Room-model misspecification      | not measurable from inside         | NOT fixed               |
| Projection error                 | not measurable from inside         | NOT fixed               |

The last two dominate and are why the UI's decision band (`noiseBand`) is **15 points** under
MC, not the sampling se: candidates within 15 are presented as effectively tied, tie-broken
on survival odds. **[vet]** The 15 is a judgment call anchored on the review's bias
measurements, not a derived quantity.

## 7. Validation gates (executed, not assumed)

1. **Direction reproduction** (db-gated, reviewer-corrected statement): at the reference
   state (pick 11, top-10 by room ADP removed), the MC top three must be exactly
   {Cook, Henry, Allen} with Allen third, top-3 span < 8, and se < 3 for the top five. The
   review's independent run had Cook first; ours puts **Henry ahead of Cook by ≈ 1.8 pts** —
   a sign difference on the Henry−Cook delta that is inside the model-error band (and ~3×
   the paired se), flagged here rather than reconciled: the gate pins the set and Allen's
   demotion (the Jensen-gap direction), not the Henry/Cook order.
2. **Exact-enumeration match**: on a 2-team fixture, μ̂ matches a full enumeration of the
   room model within max(4·se, 0.5).
3. **Mass conservation**: instrumented over 200 scenarios and both continuations, every
   scenario removes exactly N distinct opponent picks, never mine — the sampler cannot leak
   or duplicate mass.
4. **Direct coupling**: two near-identical candidates share room paths except where the
   removed player was picked (the rejection-coupling test), and CRN-paired delta noise
   measures under independent-sampling noise — if these fail, CRN is broken even though
   means stay unbiased.
5. **Determinism**: same seed → bit-identical results; different seed → different draws; the
   async driver returns exactly the sync result.
6. **Distributional sanity**: a loyalty-boosted player is drawn at the elevated frequency his
   take-probability implies (est shift ≈ +3.2 under the σ = 4.5 room).

## 8. Known limitations (acknowledged, not defended)

- One-ply corrects my next pick only; the tail beyond it is greedy, and its residual bias is
  assumed candidate-invariant (§2).
- Candidate slate is pre-filtered (VOR top-40 + position leaders + upside lane, roster-cap
  gated); a player outside the slate is never evaluated.
- Room-model misspecification (σ floors, small-sample owner rules) propagates untouched —
  MC integrates over the model's own uncertainty, not model error.
- Projection uncertainty not sampled (deliberate; see §2 and the §6 budget).
- V_c uses season-total points and a season-static best lineup; weekly lineup dynamics are
  out of scope.
