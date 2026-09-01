# Season strategy — how this team was built and how to run it

For the in-season builder. The core warning first, because it decides your architecture:

**ESPN's projections will systematically underrate this roster, by design.** The team was
deliberately assembled from value that ESPN's numbers do not carry: risk-priced starters
and situation-conditional bench assets. A tool that drives decisions off ESPN weekly
projections will sell our positions at their low and miss the exact edges the roster was
built to harvest. ESPN's numbers have one job here, the same job they had on draft night:
they are the **room model** — they predict what our eleven leaguemates believe, and
therefore what the waiver wire and trade market will do. They are an input about
_opponents_, never ground truth about _players_.

## How the draft was played (the philosophy to preserve)

1. **Consensus over any single source.** Player value = FantasyPros-anchored consensus of
   three projection sources, rescored under the league's exact rules, with per-source
   debiasing. No single feed — least of all ESPN's — was ever trusted alone.
2. **Risk was priced, not avoided by vibes.** Every injury/suspension/role risk got an
   expected-value discount (games-at-risk × probability × points-per-game) from same-day
   research. Players whose risk could not be priced (no path to snaps, season-ending
   injuries, untrusted recoveries) were banned outright.
3. **Lag arbitrage.** Projections lag news by days, and the lag lives at the bottom of
   rosters: when volume is vacated (injury, suspension), the beneficiary's projection
   trails his new role. We boosted five such players and drafted four of them.
4. **The barbell style** (measured post-draft at a knowing cost of ~23 projected points):
   insurance on starters — small premiums paid to remove ambiguity, zero flagged risks in
   the lineup — and volatility on the bench, where a busted ticket is a free cut and only
   the right tail matters.
5. **Decisions came from a Monte Carlo rollout** (expected final team score, integrated
   over sampled futures), tie-broken by survival odds and upside, vetoed only by news.
   Post-draft calibration: the model's predicted costs matched realized outcomes within
   ~2 points every time it was testable. The process works; keep its shape.

## The roster and each player's thesis

| Player                     | Role         | Thesis                                                               | Verdict date               |
| -------------------------- | ------------ | -------------------------------------------------------------------- | -------------------------- |
| Jaxon Smith-Njigba WR      | WR1          | clean elite; no thesis needed                                        | —                          |
| Josh Allen QB              | QB           | positional ceiling, bought pre-run                                   | —                          |
| Breece Hall RB             | RB1          | healthy-enough workhorse (groin was trending back)                   | early Sept                 |
| Cam Skattebo RB            | RB2          | named NYG starter                                                    | —                          |
| Terry McLaurin WR          | WR2          | no-cloud target earner                                               | —                          |
| Kyle Pitts TE              | TE           | ceiling flavor at a dead-tier price                                  | —                          |
| Mike Evans WR              | FLEX         | room-delta value: fell 2 rounds on camp absence                      | Week 1-2                   |
| **MarShawn Lloyd RB**      | ticket       | **GB lead back IF Jacobs suspended** (charged 8/27)                  | ruling: days               |
| **Tank Dell WR**           | ticket       | HOU WR2 on ~Week-5 return (Higgins out for year, Kirk gone)          | cutdown IR call, then Wk 5 |
| **Mike Washington RB**     | ticket       | LV lead if Jeanty's ankle lingers; else standalone rookie path       | Week 1-2                   |
| **Tyler Allgeier RB**      | ticket       | only healthy ARI back (Love/Benson/Conner all out) — a month of work | Weeks 1-4                  |
| **Devaughn Vele WR**       | ticket       | NO starter next to Olave while Tyson is out (~2 months)              | Weeks 1-6                  |
| Jake Bates K / Vikings DST | stream seeds | rentals; see streaming                                               | weekly                     |

Note what the tickets have in common: **ESPN's weekly projection for each is ~0 until his
situation resolves, then jumps.** That is not a flaw in the players; it is the shape of
the asset class. The tool must track each ticket's _thesis_, not its ESPN number.

## In-season strategy → feature guidance

**The weekly job (Monday/Tuesday), in priority order:**

1. **Ticket thesis tracker.** Each bench asset carries its thesis and falsification
   condition (above). The job's first output: which theses advanced, which died. A dead
   thesis = automatic replace-from-wire recommendation. This single feature is worth more
   than any projection integration.
2. **Waiver targets via vacancy/lag logic** — the boost-wave pattern, run weekly: scan the
   week's injuries/suspensions/role changes, map beneficiaries, check whether consensus
   has caught up, rank by (inherited volume × lag). This is where season-long leagues are
   won and it is exactly what our draft tooling already knows how to do.
3. **Start/sit from matchup-adjusted consensus** — never from ESPN weekly alone. Baseline:
   our consensus points per game, adjusted for opponent. ESPN's weekly number appears as a
   _column_ (the room's opinion), useful mainly for spotting disagreement.
4. **DST/K stream rankings** — pure schedule/opponent math, auto-generated. Never hold a
   defense on loyalty.
5. **Shadow team + scorecard** (see ideas.md): the greedy-path counterfactual roster
   scored weekly on realized stats, plus flagged-player games-missed vs our EV discounts,
   ticket hit-rate, starts-lost-to-injury vs league median, override pairs, realized
   capture. This is the referee of the whole approach.
6. **Trade radar (second-order ESPN use):** leaguemates see ESPN numbers. Where our
   valuation exceeds ESPN's, they will sell low (buy window); where ESPN exceeds ours,
   they will overpay (sell window). Surface the top gaps weekly. Our entire bench will
   look like "junk" to ESPN-eyed owners until theses resolve — which is precisely when to
   buy their equivalents and never sell ours pre-resolution.

**Standing calendar:** Week 7 = Allen bye → stream a QB (six startable QBs went undrafted;
plan the FA add in week 6, spend no waiver priority). Week 11 = JSN + Pitts double-bye.
Waiver priority is reserved for contested breakouts only; K/DST/QB streams ride free
agency.

**Calibration notes carried from draft night:** the MC threat model's survival estimates
were sober; the ADP-based pNext ran hot — trust threat-style modeling, recalibrate or
retire pNext. And projection-based capture cannot see bench value (measured: the realized
metric rewarded the upside bench that projection-capture ignored) — build season KPIs on
_realized_ outcomes, not projected ones.

**The one-line version for every feature decision:** _our numbers value players; ESPN's
numbers predict opponents. Any feature that confuses those two jobs is working for the
other eleven teams._
