# Engine mechanics

How a raw stat projection becomes a draft recommendation. Every number in the examples is real
— pulled from the live DB and reproducible from the CLI. Pipeline at a glance:

```
sources (Sleeper, ESPN, FantasyPros)
  → id resolution (crosswalk)
  → per-source season stat lines
  → debias (rank-band, relative)
  → consensus (FP-anchored shrinkage; median fallback)
  → league scoring (Choo choo choo's actual rules)
  → VOR (replacement via FLEX simulation)
  → tiers (gap detection)
  → board ⟵ market layer (ADP, room model, survival odds)
  → rollout (est. final team score per candidate)
```

## 1. League scoring — stat line × rules = points

Scoring rules come from ESPN `mSettings`, never assumed. The rules that matter here:

| Stat                 | Points      |     | Stat           | Points             |
| -------------------- | ----------- | --- | -------------- | ------------------ |
| passing yard         | 0.04 (1/25) |     | reception      | **0.5** (half-PPR) |
| passing TD           | 4           |     | receiving yard | 0.1                |
| interception         | **−1**      |     | rushing yard   | 0.1                |
| rushing/receiving TD | 6           |     | fumble lost    | −2                 |
| 2-pt conversion      | 2           |     |                |                    |

The scorer is a dot product:

```
score(stats) = Σ over stat keys k: stats[k] × rulePoints[k]
```

**Real example** — Jahmyr Gibbs, Sleeper's projected stat line (255 rush att, 1251 rush yd,
12 rush TD, 63 rec, 533 rec yd, 3 rec TD, 1 two-pt, 1 fumble lost):

```
1251×0.1 + 12×6 + 63×0.5 + 533×0.1 + 3×6 + 1×2 + 1×(−2)
= 125.1 + 72 + 31.5 + 53.3 + 18 + 2 − 2
= 299.9        ← matches Sleeper's own pts_half_ppr to the decimal
```

That decimal match is not luck — it is an ingest-time validation. Every source's pre-scored
total is reproduced from its stat line (554 Sleeper players, max delta 0.000; ESPN within
1.03; FantasyPros within 0.47). If a source changes meaning of a field, ingest fails loudly.

## 2. Consensus — three sources, three roles

The sources are not three interchangeable experts:

- **Sleeper** (= Rotowire): one independent shop; the only deep source (~3,100 players).
- **ESPN**: the platform the room drafts on; ingested for the room model regardless of
  accuracy. Partially inside FP's aggregate already.
- **FantasyPros**: aggregate of ~110 experts; the accuracy anchor. Currently fenced to the
  top 10 per position (40 rows) for anonymous fetches.

Measured bias (matched players): means agree within ~2 pts at QB/WR/TE, +9 at RB — but ESPN
runs 20–36 pts hotter at the _top_ of QB/RB/WR and Sleeper hotter at the top of TE. A spread
difference, not a location shift — so debiasing is per rank band, multiplicative:

```
for each position, rank band (1–12, 13–24, 25–36, 37+):
  factor[source] = median(source pts / panel-median pts) over band's shared players
  debiased[source] = pts / factor[source]     # skip bands with too few shared players
```

Then consensus, two cases:

```
if player has an FP row:                        # the top of the board
  deviation = weightedMean(sleeper×1.0, espn×0.5) − fp     # all debiased points
  k = clamp(0.2 × (ecr.stdDev/√rank) / 1.5, 0.05, 0.35)   # 1.5 = measured pool median
  consensus = fp + k × deviation                           # of std/√rank, so the median-
else:                                           # nearly everyone    dispersion player gets 0.2
  consensus = median(debiased sources present)  # median of 2 = mean; 1 passes through
```

All constants (k range, bands, factor clamps, contested threshold) live in one `tuning.ts`
object. FP is debiased by its own band factor like every source, which nudges the anchor
slightly toward the panel median before shrinking.

FP anchors; the others shrink it, never outvote it. `k` grows when FP's own expert panel is
torn (high `rank_std`) and stays near the floor when the 110 agree — two correlated outside
sources cannot drag consensus across a confident aggregate, and deviation magnitude matters
(a unanimous 40-pt deviation moves more than a 4-pt one). ESPN's half-weight discounts its
partial presence inside FP.

**Real example** — Gibbs: Sleeper 299.9, ESPN 330.9, FP 337.2. Pre-FP the consensus was the
two-source mean; with the anchor his final consensus is **335.9** — the panel sided with
ESPN, Sleeper's compressed elite-RB view is now a recorded dissent instead of half the
answer. The correction cuts both ways: CMC (295.6 → 293.1) and Nacua (286.1 → 280.0) moved
_down_ to their FP anchors, which sit below ESPN for them. Anchoring is not "ESPN wins" —
it's "the panel wins, others tug proportionally."

Storage note: consensus is persisted as a stat line (the shrunk points target applied as a
uniform scale to the stat line), so everything downstream — including the rescorer — works
unchanged.

## 3. VOR — value over replacement

Points mislead across positions; the question is points _above what a waiver pickup gives
you_. Replacement level is simulated, not assumed:

```
pool = every projected player, sorted by league points
for each of 12 teams: fill QB×1, RB×2, WR×2, TE×1, then FLEX = best remaining RB/WR/TE
replacementRank[pos] = first rank left unrostered at that position
VOR(player) = points(player) − points(replacement at their position)
```

The greedy FLEX fill is why replacement ranks are not formulaic: the 12 FLEX seats split
5 RB / 7 WR / 0 TE by best-points, yielding **QB13 @ 295.0, RB30 @ 157.0, WR32 @ 157.2,
TE13 @ 127.7**.

**Real example** — Josh Allen projects 371.3, Gibbs 315.5 (pre-FP consensus). Allen out-scores
Gibbs by 56, yet:

```
Allen VOR = 371.3 − 295.0 (QB13) =  76.3
Gibbs VOR = 315.5 − 157.0 (RB30) = 158.5
```

Gibbs is worth twice as much, because a free QB scores 295 and a free RB scores 157. This one
subtraction is why nobody sane drafts a kicker in round 3.

## 4. Tiers — where the cliffs are

Per position, sort by consensus points and find breaks where the drop between consecutive
players exceeds the position's typical drop (mean + 1σ of all drops in the draftable pool).
Tier numbers are display and scarcity fuel ("RB tier 4: 3 left"); they do not feed the
rollout, which sees the raw points directly.

## 5. Market layer — price, room, and survival

Projections say what a player is _worth_; the market layer says what he'll _cost_ and how
long he'll _last_. Kept strictly separate from projections.

- **ADP** in three formats from Sleeper + ESPN's own. Planning uses **room ADP** — ESPN's
  first, because your eleven leaguemates draft inside ESPN's UI. `roomDelta = espn − market`
  measures where the room's board disagrees with the market (measured: 54 of 141 draftable
  players differ by ≥ a full round).
- **Survival odds** — a player's draft position is modeled Normal(adp, σ), σ from expert
  disagreement where present (`max(rank_std, 2)`) else `0.15·adp + 2`. Availability at your
  pick n, conditioned on having survived to the current pick c:

```
S(n)   = 1 − Φ((n − adp) / σ)          # unconditional survival past pick n
P(available at n) = S(n) / S(c)
```

**Real example** — Derrick Henry, room ADP 16.0, σ = 0.15×16 + 2 = 4.4, from pick 1:

```
S(11) = 1 − Φ((11−16)/4.4) = 1 − Φ(−1.14) ≈ 0.87   → 87% at your pick 11
S(14) = 1 − Φ((14−16)/4.4) = 1 − Φ(−0.45) ≈ 0.67   → ~69% at pick 14
```

— the exact 87%/69% shown on the board.

## 6. Rollout — est. final team score per candidate

The board's headline number. For each candidate at your current pick: assume you take him,
simulate the rest of the draft, sum your projected starters.

```
evaluateCandidates(state):
  for each candidate (top ~40 VOR + top-3 per position):
    roster = myRoster + candidate
    for each remaining pick in order:
      if my pick:  roster += chooseForRoster(available, roster)
      else:        remove next available by room-ADP order      # mean path
    estTeam = starterTotal(roster)   # best legal lineup, open seats valued at replacement

chooseForRoster:                     # need-aware, anti-hoarding
  starting seat open → maximize marginal starter points over a replacement-filled baseline
  bench territory    → maximize upside score, hard caps (QB/TE ≤ 2, RB/WR ≤ 6)
```

"Marginal over replacement-filled baseline" is what stops QB hoarding: a 371-pt QB fills a
seat a free 295-pt QB would fill anyway (+76), while a 253-pt RB fills a 157-pt seat (+96).

**Real example** — pick 11, pre-draft (top of the evaluate table):

```
James Cook    RB  VOR 96.6  → est team 1535   (baseline)
Josh Allen    QB  VOR 76.3  → est team 1528   (−7.5)
Derrick Henry RB  VOR 94.2  → est team 1522   (−13.4)
Brock Bowers  TE  VOR 69.9  → est team 1514   (−21.9)
```

Note Allen: 20 VOR behind Cook but only −7.5 in rollout — the sim knows Henry-grade RBs
survive to pick 14 while Allen does not survive to pick 35. Sequence math, automated. The
anchors: ceiling (best possible starters) **2016.7**, all-replacement team **1208.4**, so
`capture = (estTeam − 1208.4) / 808.3` ≈ 40% for a well-played slot-11 draft — the live
draft grade.

## 7. Uncertainty signals — human-facing, never auto-steering

- **Upside score** (0–100): mean of rank-percentiles of (a) ceiling jump = FP consensus rank
  − best single expert rank, (b) FP expert σ, (c) debiased cross-source spread. Example:
  Baker Mayfield, ADP 152, consensus 118, best expert 62 — someone credible sees a top-5 QB
  season for a round-13 pick. Bench picks are chosen by this, not by mean: a 25th- and a
  45th-percentile bench outcome are both cuts, so only the right tail matters.
- **CONTESTED flag**: debiased residual spread across sources ≥ ~30 pts. Flags players whose
  sources are betting on different worlds (Tyrone Tracy: Sleeper 101 vs ESPN 35; Zach
  Charbonnet the reverse) — the consensus number is soft, a human should look.
- **Overrides** (`overrides.json`): ban (excluded from recommendations, still visible) and
  boost ±points — the manual lane for news the sources haven't priced.

Both flags inform; neither reorders the rollout's recommendation. Planners amplify input
error, so anything model-shaky stays display-only.

## 8. Data inventory — everything used beyond stat-line projections

| Data                                  | Source                 | Used by                                         |
| ------------------------------------- | ---------------------- | ----------------------------------------------- |
| Scoring rules                         | ESPN mSettings         | scorer (§1)                                     |
| Lineup slots + league size            | ESPN mSettings         | replacement sim (§3), rollout roster math       |
| Draft order + my slot                 | ESPN mSettings         | pick arithmetic (11, 14, 35, 38…), odds targets |
| ADP (3 formats × 2 sources)           | Sleeper, ESPN          | room model, survival odds, room Δ (§5)          |
| Expert consensus rank + tier          | FP ecrData             | board context columns                           |
| Expert best/worst/σ per player        | FP ecrData             | shrinkage gate (§2), upside (§7), odds σ (§5)   |
| Percent rostered                      | ESPN, FP               | context display                                 |
| Injury status                         | Sleeper, ESPN          | board flag                                      |
| Bye weeks                             | FP                     | roster collision warnings                       |
| Team/position identity + id crosswalk | all + dynastyprocess   | joins everything                                |
| Live draft picks                      | ESPN mDraftDetail poll | board state, rollout, conditional odds          |
| Manual pick marks                     | operator               | poll-failure fallback, merged with polled       |
| Owner overrides                       | overrides.json         | ban/boost (§7)                                  |

Ingested but **not yet used**: player age / draft year (in the crosswalk; feeds the
post-draft archetype layer). Designed but deferred: nflverse historicals (empirical
floor/ceiling distributions, calibration of k and σ against actual outcomes).
