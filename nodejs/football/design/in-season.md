# In-season system design

The in-season counterpart to the draft tooling: data model, features, and operating model
for running the roster from week 1 through the playoffs. `season-strategy.md` is the
governing document — it defines the team's philosophy and the asset theses this system
exists to manage; this doc translates it into architecture. `data-models.md` remains the
model spec of record; additions here extend it.

## Operating model: agent-in-the-loop

Features are built as library functions and CLIs that emit structured output (JSON +
markdown). An agent session composes them, applies judgment (news assessment, thesis
verdicts, risk pricing — the same judgment lane the draft used), and writes a short memo.
The human reads the memo and executes the clicks in ESPN. The web UI is not the primary
surface; it stays draft-shaped until a need emerges.

Two scheduled runs drive the season:

| Run             | When              | Output                                                                       |
| --------------- | ----------------- | ---------------------------------------------------------------------------- |
| **Weekly memo** | Tue (waivers process Wed ~3am) | week review, thesis verdicts, waiver claims + drop pairings, trade radar, scorecard |
| **Lineup card** | Thu + Sun morning | optimal lineup, risk flags, stream confirmations, disagreement callouts      |

## Architecture principles

1. **Two valuation lanes.** The *value lane* — FantasyPros-anchored consensus of multiple
   sources, rescored under exact league rules, debiased — prices players. The *room lane*
   — ESPN's numbers — predicts the other eleven owners: what the wire will contest, what
   the trade market believes. Every projection row is tagged with its source; every
   feature declares which lane it reads. ESPN weekly projections drive no decision
   directly; they appear as a disagreement column and as the trade radar's gap input.
2. **Theses are data.** Each speculative asset carries its thesis, falsification
   condition, and verdict window as a first-class record. The weekly job's first output is
   thesis verdicts, ahead of any projection math.
3. **KPIs on realized outcomes.** Season scorecards use realized nflverse points under
   league rules. Projected-value metrics (capture, projection deltas) are diagnostics.
4. **Weekly granularity throughout.** Projections, stats, and value all carry a `week`
   dimension; season totals are aggregations, not the primitive.

## The weekly loop

| When        | Step                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------- |
| Tue         | Ingest (stats, rosters, projections, news) → weekly memo → human submits waiver claims       |
| Wed         | Post-waiver resync; confirm claims; refresh ROS values against the new roster                |
| Wed–Sat     | News watch (existing pipeline); trade radar follow-ups; evaluate any incoming offers         |
| Thu         | Lineup card for Thursday players                                                             |
| Sun morning | Full lineup card: final injury statuses, weather, stream confirmation                        |

Standing calendar entries feed the memo automatically: **week 6** — plan the week-7 QB
stream for Allen's bye (FA add, no waiver priority; six startable QBs went undrafted);
**week 11** — JSN + Pitts double-bye. Waiver priority is reserved for contested breakouts;
K/DST/QB streams ride free agency.

## Data model additions

New entities (extending `data-models.md`; SQLite migrations in `data`):

| Entity              | Key fields                                                                                          | Source                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| `Team`              | `teamId`, `name`, `owner`, `standing {wins, losses, pointsFor}`                                     | ESPN `mTeam`                 |
| `RosterEntry`       | `teamId`, `playerId`, `lineupSlot`, `acquisitionType`, `asOf`                                       | ESPN `mRoster`               |
| `Matchup`           | `week`, `homeTeamId`, `awayTeamId`, `homeScore`, `awayScore`                                        | ESPN `mMatchup`              |
| `WeeklyProjection`  | `playerId`, `source`, `season`, `week`, `stats`, `prescored`                                        | ESPN (kept per-week), FP, Sleeper |
| `HistoricalGameStat`| as specced in `data-models.md`: week, opponent, stats, usage (target/air-yards/wopr/snap share)     | nflverse (lifted from `realized-capture`) |
| `NflGame`           | `season`, `week`, `team`, `opponent`, `kickoff`, `homeAway`                                         | nflverse schedules           |
| `PlayerThesis`      | `playerId`, `thesis`, `falsification`, `verdictWindow`, `status: open\|advanced\|resolved\|dead`, `log[] {asOf, note}` | seeded from `season-strategy.md`; updated by weekly verdicts |

The free-agent pool is derived: players on no `RosterEntry`. `myTeamId` comes from
`mTeam`, replacing the draft-order inference.

Derived values (computed, not stored): **weekly consensus** (value lane, built with the
existing consensus/debias machinery per week), **ROS value** (remaining-weeks consensus,
blended with realized performance as the season accumulates), **opponent-vs-position
strength** (fantasy points allowed by position from `HistoricalGameStat`, blended with
prior-season data while the sample is small).

## Features

In the priority order set by `season-strategy.md`:

### 1. Ticket thesis tracker

For each open `PlayerThesis`, the weekly run gathers the evidence that bears on it —
usage from `HistoricalGameStat`, roster/depth moves, news items — and the agent renders a
verdict: advanced, resolved, or dead. A dead thesis produces an automatic
replace-from-wire recommendation (the vacancy scanner supplies the candidate). Verdicts
append to the thesis log; resolutions flow into the overrides lane (a resolved ticket gets
its boost re-priced; a dead one is a free cut). Open-thesis players are excluded from all
sell and drop suggestions.

### 2. Vacancy/lag waiver scanner

The boost-wave pattern from the draft, run weekly: scan the week's injuries, suspensions,
and role changes (news pipeline + injury statuses + usage deltas); map beneficiaries via
depth context; check whether consensus has caught up; rank by inherited volume × lag.
Output: ranked adds with drop pairings, each tagged *contested* (spend priority) or
*uncontested* (FA add) using the room lane — ESPN %rostered and ESPN projection jumps
predict what the room will chase.

### 3. Start/sit optimizer

`bestLineup` over matchup-adjusted weekly consensus: value-lane points per game adjusted
by opponent-vs-position strength. ESPN's weekly number renders as a column; large
disagreements get called out for review rather than acted on. Barbell discipline is
enforced as a gate: flagged risks (injury designations, unresolved theses) don't enter
the starting lineup without an explicit agent/human sign-off. The card also flags
next-week byes worth planning around.

### 4. DST/K stream rankings

Pure schedule/opponent math from `NflGame` + opponent strength, auto-generated for the
next two weeks. Streams ride free agency.

### 5. Trade radar

Second-order use of the room lane. For every rostered player compute the gap
`ourROS − espnROS`:

- **Buy windows**: other rosters' players with large positive gap — their owner sees the
  ESPN number and will sell low.
- **Sell windows**: our players with negative gap — the room overvalues them. Open-thesis
  tickets are excluded regardless of gap.
- **Proposal generation**: pair our surplus against a team whose need matches, and value
  the package double-lens — it must gain *our* lineup in the value lane and *their* lineup
  in the room lane, since that is the lens each side actually evaluates with. Incoming
  offers are scored the same way.

Output: top gaps league-wide each week, plus concrete proposal sketches when a double-lens
win exists.

### 6. Shadow team + scorecard

The referee (see `ideas.md`): the greedy-path counterfactual roster scored weekly on
realized stats alongside the real team. Season KPIs, all realized-basis: running
real-vs-shadow gap, ticket hit rate, flagged-player games missed vs the EV discounts paid,
starts lost to injury vs league median, override-pair season totals, realized capture vs
the historical band, weekly lineup efficiency (optimal minus actual).

## Reuse map

| Existing code                                   | In-season role                                        |
| ----------------------------------------------- | ----------------------------------------------------- |
| `compute/src/roster.ts` (`bestLineup`)          | start/sit engine, lineup-efficiency KPI, trade fit    |
| `compute/src/rescore.ts`, `data/src/scoring.ts` | league-exact scoring of weekly stats and projections  |
| `compute/src/consensus.ts`, `debias.ts`         | weekly consensus (value lane)                         |
| `compute/src/vor.ts`                            | replacement levels for waiver ranking and trade value |
| `compute/src/overrides.ts` + `overrides.json`   | thesis resolutions, risk pricing                      |
| `data/src/news/*`                               | thesis evidence, vacancy detection                    |
| `data/src/ingest/resolver.ts` + crosswalk       | id joins for every new source                         |
| `compute/src/cli/realized-capture.ts`           | donor code for the nflverse fetcher + realized KPIs   |
| `web/src/poller.ts`                             | polling pattern for roster sync                       |

The draft `sim/` layer, board assembly, and room-profile modeling stay draft-only. One
calibration carry-over from draft night: threat-style modeling earned trust; ADP-based
pNext ran hot and is retired for in-season purposes.

## Build order

Season starts in two weeks; phases land in dependency order, each independently useful.

1. **Foundation** — roster/team/matchup sync, weekly projections (both lanes), nflverse
   weekly stats + schedule, `PlayerThesis` model seeded from `season-strategy.md`.
2. **Weekly essentials** — thesis tracker, vacancy/lag scanner, start/sit card, DST/K
   streams; the memo CLI that assembles them. Target: usable for week 1 (thesis tracker
   and lineup card matter most in weeks 1–2, when most verdict windows fall).
3. **Trade radar + ROS re-projection** — gap computation, double-lens proposals, blended
   ROS values.
4. **Shadow team + scorecard** — needs a few weeks of realized stats to be interesting;
   backfills from week 1 once built.

## Open questions

- ESPN `mTransactions` for waiver/trade history: needed for the scorecard's league-median
  comparisons, or derivable from roster diffs?
- Matchup adjustment weighting early season: how many prior-season weeks to blend, and at
  what decay?
- FantasyPros weekly quota (50 calls/day): which positions/weeks get FP coverage vs
  leaning on Sleeper + ESPN for the weekly lane?
