# Weekly operating protocol

Instituted 2026-10-12 after the week 5 post-mortem. This is the execution checklist for
advisory sessions; `in-season.md` is the architecture it implements, `season-log.md` the
record. A session that skips a step says so explicitly rather than improvising around it.

## Standing rules (every session, before any recommendation)

1. **No facts from priors.** Any fact entering a decision — a player's NFL team, bye,
   opponent, kickoff time, injury status, depth-chart role — comes from the ESPN API
   (`proTeamId`, status tags, projections) or an official page fetched _this week_. Real-world
   knowledge is a hypothesis to verify, never a source. (Cost of violating: the Carlson pick —
   wrong team, wrong bye, a narrative invented to defend it.)
2. **Two sources for load-bearing status claims.** OUT/ACTIVE/practice-participation claims
   that change a start/sit require either the official team injury-report page (WebFetch, not
   search snippets) or two independent dated reports. Search-result blurbs mix weeks and games.
3. **Decisions get probabilities, not adjectives.** "Safest," "basically free," "near-certain"
   are banned unless accompanied by the number and its source. A 10-point NFL favorite loses
   outright ~1 week in 6; say so when betting on it.
4. **When an input changes, re-run the comparison it fed.** A usage spike, injury, or
   projection flip on a bench player reopens the start/sit against his slot counterpart that
   day — stale framings ("X is the insurance guy") don't survive new data. (Cost: Lloyd 16.2
   benched behind Allgeier 2.6 after Lloyd's 55%-snap week was already known.)
5. **Log append is part of the session,** not an afterthought: moves, picks with their
   probabilities, verdicts, and any error found in a prior entry (corrected forward, never
   rewritten).

## Tuesday — the memo run

1. Pull final week stats for both lineups (ESPN, statSourceId 0). Write the week's result
   with an **optimal-lineup delta** and a process-vs-variance verdict per call.
2. **Usage table** for every rostered player + watchlist: snaps/routes/targets/carries,
   3-week trend (web box-score pages or nflverse; ESPN projections are NOT usage). Flag any
   bench player whose trend crossed his slot counterpart.
3. Thesis verdicts (per `in-season.md` feature 1) before any projection math.
4. Waiver sweep: FA pool deltas since last week (who dropped, who cleared), bye-driven demand
   forecast two weeks out (who must rent, what they'll take), claim-vs-free-add call per the
   league's daily-run rolling-priority model.
5. Trade radar: value-lane vs room-lane gaps, plus the standing targets.

## Value lane (the core fix)

ESPN's projection column is the room lane — it is what every leaguemate reads, and per the
architecture it **drives no decision directly**. Each week the memo builds a value-lane
number for contested decisions:

- Pull FantasyPros weekly consensus (FP_API_KEY in `.env`; mind the 50-call/day quota —
  roster + shortlist positions only), rescore under league rules (`compute/src/rescore.ts`).
- Where FP and ESPN disagree by >3 points, the disagreement is the finding: investigate
  usage/news until the gap is explained, then decide from the explanation.
- Until a pipeline exists as code, this is done ad hoc in-session — but it is done, not
  skipped. (Weeks 3–5 ran entirely on the room lane. That is the single deepest process
  failure this protocol corrects.)

## Friday — the card draft

1. Official injury reports (team pages, Wed/Thu/Fri participation grid) for every starter,
   Q-tagged bench player, and the fantasy opponent's flagged players.
2. **Opponent projection**: compute their likely lineup total, not just mine. Risk posture
   follows: clearly favored → floor lineup; clear dog → ceiling/variance (embrace boom
   players, correlated stacks). State the posture in one line before any start/sit.
3. **Lock-order table**: every start/sit candidate with kickoff time, inactives time
   (~90 min prior), and which pivots stay open after each lock. The absentee-default rule
   stands: a Q player with an early lock is the worst default; a later-locking certain player
   is free insurance. EV math per slot, in writing.
4. **Interaction checklist** (new, mandatory):
   - Does any starter face my own D/ST? (Avoid at add time; flag at lineup time. Fannin 0.9
     vs my Jets 15.0 was built a week earlier when I streamed his opponent.)
   - Same-game correlations among my starters (stack or hedge — know which).
   - My D/ST or IDP-equivalents vs the fantasy opponent's players, and theirs vs mine.
   - If a block/snipe is on the table: trace the opponent's _actual next-best option and its
     specific matchup_ — never price a block against "shelf depth" in the abstract. (The
     declined Brissett snipe would have pushed Walker onto Watson, who played into my own
     Jets D/ST — a visible ~15-point interaction, missed.)

## Sunday morning — the final card

1. Re-pull roster tags + inactives-relevant news for Q players only. No new research rabbit
   holes; the Friday card governs unless a status changed.
2. Each conditional from Friday fires or doesn't; absentee defaults already set.

## Loser pool protocol

1. Candidates = all unused teams, ranked by **moneyline-implied win probability**, not spread.
   State the bust probability next to the pick (a −10 favorite ≈ 80–85%, i.e. 1-in-6 bust).
2. **Discount injury-inflated spreads.** A big number that exists because of a backup QB or
   short-week situation is the profile Vegas misprices most — prefer a slightly smaller
   number against a _structurally_ bad team over a bigger number created by a transient
   injury. (TB +10 with a backup QB beat Dallas outright and ended a 4-0 run.)
3. Check the _favorite's_ health too (the week-3 Purdy downgrade nearly busted the ARI pick).
4. Record pick + two alternates with probabilities in the log before lock.
5. Hoard policy unchanged: structurally bad teams are renewable; take the best sound number.

## Build backlog (the durable fix)

The ad-hoc version of this protocol costs a session most of its budget. In-season Phase 1/2
from `in-season.md` — roster/matchup sync, weekly projections both lanes, usage from
nflverse, `bestLineup` with opponent-vs-position strength, a memo CLI — replaces most of it
with one command. Until built, the checklists above are the manual pipeline.
