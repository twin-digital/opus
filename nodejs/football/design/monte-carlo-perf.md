# Monte Carlo evaluation — performance mechanisms

Reference doc: every speedup mechanism considered for the MC candidate evaluation, with
rough multipliers, so we can circle back as needed. Baseline: ~2.6 s per full evaluation
(≈44 candidates × 300 scenarios, object-based rollout core, single thread).

Deployed tonight: CRN (#2) + compute-per-pick-event (#0). Deliberately deferred: everything
else. Owner ruled scenario reuse (#3) out of the first build.

## #0 — Compute per pick-event, not per decision (deployed)

The evaluation is recomputed server-side whenever a pick lands (state version bump), off the
request path. Picks arrive ~every 30 s; the eval takes ~3 s; by the time the user is on the
clock the answer is already computed. Worst case (the pick immediately before ours) the
panel shows a "computing" flag for a few seconds. This removes the 90-second-clock framing
entirely — remaining mechanisms are about more samples, not meeting a deadline.

## #1 — Particle filter over room scenarios (the endgame design)

Maintain K sampled room-futures continuously between picks. Every real pick FILTERS the
set: scenarios consistent with the observed pick survive (their remaining path stays valid),
inconsistent ones are discarded and resampled from the posterior. The evaluation is then
always warm and conditioned on everything observed so far; on-clock cost ≈ 0. Converts MC
from batch recompute to a live posterior. Multiplier: effectively removes the deadline and
reuses most sampling work across picks. Best paired with #3/#6. Post-season project.

## #2 — Common random numbers (deployed)

All candidates share the same room draws per scenario, keyed (scenario, team, round) so
paths stay synchronized despite pool differences. Deltas difference out shared noise:
~6–15× fewer samples for equal decision quality. See crn-methodology.md. Extension:
antithetic pairs (mirror each scenario's uniforms) for another ~2× on smooth statistics.

## #3 — Scenario reuse with per-candidate patching (deferred by owner)

The room's path barely depends on which candidate we took — one player differs. Simulate
each scenario's room ONCE; per candidate, patch (where the room "wanted" the taken player,
it takes its next choice) and re-run only our own future picks. 44×K rollouts → K room sims

- 44×K cheap patches. ~10×. Main correctness risk: the patch must preserve the room model's
  distributional behavior (a naive next-best patch slightly distorts downstream need counts).

## #4 — Racing / successive halving (best-arm identification)

All candidates at K=5 → drop the clearly-dominated → survivors at K=30 → top handful at
K=300+. Compute concentrates on the photo finish. ~3–5×, and deadline-graceful (interrupt
anytime, current best stands). Pairs naturally with #2 (paired comparisons are what race).

## #5 — MC near, mean-path far

Sample the next 3–4 rounds (where candidate-relevant variance lives), splice the
deterministic mean-path continuation beyond. Rollout length halves; far-future noise (which
is common-mode across candidates anyway) is excluded. ~2–3×. Vet: confirm the splice horizon
doesn't reintroduce the Jensen bias for players whose ADP sits just past it.

## #6 — Typed-array core

Flatten the rollout hot loop: players as integer indices, pools as bitmasks/typed arrays,
pre-sorted per-position point arrays, incremental lineup totals instead of full recompute.
Mechanical rewrite of ~300 lines. 10–30×. Prerequisite for #7 to shine (workers copying
typed arrays is cheap; copying object graphs is not).

## #7 — Worker threads

Scenarios are embarrassingly parallel. node:worker_threads across ~10 cores: ~8×
wall-clock. Combine with #6's transferable buffers.

## #8 — WASM / native / GPU

Rust-to-WASM hot loop: 3–5× over a tuned JS typed-array core. WebGPU scenario-parallel
kernel: thousands of scenarios in lockstep — the argmax/lineup logic vectorizes awkwardly
but scenario-level parallelism is trivially data-parallel. Fun tier; only justified if #1's
particle count grows into the tens of thousands.

## #9 — Cloud fan-out

Stateless scenario batches over HTTP to burst compute. Works, but network latency dominates
at this problem size and it adds a draft-night availability dependency. Reserved for when a
single machine can't hold the particle set — nowhere near.

## Composition guide

Practical stack, in adoption order: #0+#2 (deployed) → #4 racing → #3 patching → #6 typed
arrays → #7 workers → #1 particle filter (→ #8 if ever needed). Conservative product of the
middle four ≈ 500–5000×: 2.6 s becomes low milliseconds, or the same budget buys K in the
hundreds of thousands — at which point sampling error is dead as a concern and model error
(σ calibration, continuation policy, projection uncertainty) is the whole game.
