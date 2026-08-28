# Draft day runbook

Draft: **2026-08-28 20:00 UTC** (4:00 PM EDT). League 1838733150, 12 teams, snake, half-PPR.
You are team 13, slot 11 — picks 11, 14, 35, 38, …

All commands run from the repo root unless noted. Creds live in `nodejs/football/.env`
(`ESPN_LEAGUE_ID`, `ESPN_S2`, `ESPN_SWID`).

## Morning of the draft

1. **Verify ESPN creds still work** (they expire if you re-log-in to ESPN):

   ```sh
   cd nodejs/football/data && FP_PROJECTIONS_MODE=skip pnpm ingest
   ```

   `skip` keeps the stored FantasyPros projections: the FP API allows 50 calls/day and a
   full FP fetch costs 32, so plain `pnpm ingest` can exhaust the quota and downgrade FP
   coverage to the 40-row page scrape. Only drop the flag when you deliberately want a
   fresh FP pull and know the quota is available.

   A working run prints `league "Choo choo choo" (12 teams, draft 2026-08-28T20:00:00.000Z)`
   and a summary with `league_settings: 1`. If the ESPN step fails with 401/403: log in to
   fantasy.espn.com in a browser, copy fresh `espn_s2` and `SWID` cookies into
   `nodejs/football/.env`, and re-run. This same run is the data refresh (fresh ADP/ECR,
   injuries, projections), so doing it the morning of covers both.

2. **Start the server** (build first — `serve` runs the compute package's built `dist`, and a
   stale build silently serves the old evaluation engine):

   ```sh
   pnpm build && cd nodejs/football/web && pnpm serve
   ```

   It logs the league, your slot, whether creds are present, the evaluation engine
   (`evaluate: Monte Carlo (K=300)`), and the URL; each MC recompute logs its duration.

3. **Open the board**: <http://127.0.0.1:8020/>

   Sanity check before the draft starts: pick 1, T8 on the clock, "your picks 11, 14",
   `POLL OFF`. Flip **live poll** on once and confirm the pill goes `POLL OK Ns` — that is
   the end-to-end creds check. Leave it off until the draft starts if you like; it only
   polls while the toggle is on.

4. **When ESPN posts the real draft order** (~1h before the draft), click **Refresh data**
   once — pick numbers, threat markers, and the slot labels in threat tooltips all
   recompute from the live order.

5. **Clear any rehearsal marks**: if the drafted count is not 0, hit **Reset manual** in
   the status bar — it deletes every manual mark in one confirmed click (polled picks are
   never touched).

## During the draft

- Turn **live poll** on. Picks land on the board within ~5s of ESPN registering them.
- **Candidate evaluation is Monte Carlo**: EST TEAM is the mean final starter total over
  ~300 sampled drafts (the room drawn from the profiled take distribution; your later picks
  greedy, with a one-ply lookahead at your next pick), so it prices in who might be gone
  instead of assuming the single most-likely path. A small **%** next to Δ best is
  P(best) — the share of sampled drafts where that pick's team scores highest (exact ties
  split the win and show a ≡). Under MC the green Δ band widens to 15 pts — model error,
  not sampling noise, is the binding uncertainty — so treat green rows as decision-ties and
  break them on Back@/UPS. The evaluation recomputes off-path after each pick (~15s at
  K=300); a subtle "simulating…" appears while the panel still shows the previous pick's
  numbers. `FOOTBALL_EVAL=det` at server start is the instant fallback to the old
  deterministic rollout, no other changes.
- **When you are on the clock** a violet panel appears above the board: candidates ranked
  by projected final starter total (EST TEAM), with **Δ best** (the decision column),
  the lineup slot each lands on, **ECR** (the independent expert-consensus audit — "is
  this a real player"; hover for room ADP), upside score, and the odds each makes it back
  to your next turn if you pass. **Δ best is color-banded** on the same tokens as Back@: green =
  within 3 pts of BEST (rollout noise — effectively tied, break the tie on Back@: green Δ
  with low Back@ means take him now, green Δ with high Back@ means safe to pass), amber =
  real but modest cost, muted = expensive. The row order is always EST TEAM descending —
  the green band is a visual "equivalent, decide by Back@/UPS", it never reorders rows.
  Genuine ties (within half a point, the late-draft all-tie case) order by starting-seat
  fillers first, then upside, then points — so when whole slates tie, the order itself is
  the recommendation (the slate always includes the top-10 upside plays, not just
  top-VOR).
  The **ME** button in the panel drafts straight from it. When it is not your turn, a
  one-line strip shows the top-3 "if he falls to you".
- **capture** in the status bar is the live draft grade: (your starters − replacement) /
  (ceiling − replacement); hover for the numbers.
- The **Rm Δ** column shows how the room's board (ESPN) prices a player vs the wider
  market as banded arrows: **▲▲** likely falls 2+ rounds past his market price, **▲** ≥12
  picks, **—** priced about right, **▼** the room reaches ≥12 picks early, **▼▼** ≥24
  (hover for the real numbers). **UPS** (upside 0–100) comes from expert disagreement; a
  **!** by a name means the projection sources genuinely disagree (hover for the spread).
- The narrow **N** column holds the news dots: red = harms, green = improves, gray =
  unclear; bigger and more saturated = higher impact (hover for "harms/high · N items").
  Sort it to float harms/high to the top. No dot means no assessed news. **Click the dot
  or any player name** (board or on-clock panel) to open the news drawer: injury status,
  each assessed story's 1–2 sentence summary with a direction/impact chip, the expandable
  full story, and unassessed headlines below.
- The drawer's footer is the override lane: **Ban** (note defaults to the latest harms
  summary), **Boost ±points**, **Un-ban / clear**. These rewrite `overrides.json` in place
  and reload it immediately — no restart. They work during a mock too (overrides are
  config, not draft state).
- **Threat markers** `!` / `!!` / `!!!` (amber → red) in the P@ columns flag players the
  room model expects to be gone before your pick — 25–50% / 50–75% / >75% taken. Hover for
  the attribution: which owner, at which pick, on what historical evidence. On your turn
  the on-clock panel adds a **THREATS** line: the top-3 candidates likely to be sniped
  before your next turn if you pass.
- The sidebar's **Cost of waiting** card answers "can this position wait?": per position
  (QB/RB/WR/TE), the best available consensus points now and the expected best still there
  at your next two picks, with the drop colored on the Δ-best bands (green = waiting is
  free, amber = it costs, red = cliff). Hover a cell for the player most likely to be the
  best one left at that pick. It runs on the same profiled room model as the threat
  markers.
- **K/DST endgame nudge**: the engine never recommends K/DST (no stat lines), so the
  on-clock panel reminds you — amber when your remaining picks leave only one pick of
  slack over the open K/DST seats, red when every remaining pick is needed, with the
  top-3 available at each by ADP and one-click **ME** buttons.
- Threat markers, threats, and the room model are **roster-need aware** when picks carry
  teams (polled picks always do): a team already holding two QBs stops being predicted to
  take a third, so keep marks team-attributed when marking manually if you can.
- **Reset manual** in the status bar deletes ALL manual marks (one confirm, count shown).
  It refuses while live poll is on or a mock is running, so it cannot fire mid-draft by
  accident.
- The **Refresh data** button re-runs the ingest (several minutes) — use it only
  before the draft, not during; the poll keeps picks current on its own. It keeps the
  stored FantasyPros projections (skip mode) unless the server was started with
  `FP_PROJECTIONS_MODE` set otherwise.
- Watch the pill: `POLL OK Ns` (green, N = seconds since last success) is healthy.
  `POLL STALE` / `POLL ERR xN` means ESPN calls are failing; the server keeps retrying with
  backoff (5s → 60s) and keeps serving the last-known state — nothing crashes.

## If the ESPN poll breaks (manual mode)

The board works fully by hand; polling is an optimization.

- On someone else's pick: hit **✕** on the player's row (drafted, team unknown).
- On your pick: hit **ME** — it lands in your roster panel.
- Mistake? Toggle **show drafted**, find the row, hit **undo** (manual marks only).
- Manual marks persist in the DB and merge with polled picks (deduped by player), so if the
  poll recovers mid-draft nothing double-counts, and a server restart loses nothing.
- The pick counter treats manual marks like picks, so "on clock" / "you in N" stay right as
  long as you mark every pick.

## Mock draft (rehearsal)

Practice the real flow against a simulated room. Nothing is saved: mock picks live only in
server memory, never in the database — **Stop** (or a server restart) discards them
instantly and the real pre-draft board comes back.

- **Start**: the violet **Mock draft** button in the status bar. It asks for a pace:
  opponents pick every N seconds (default 4); `0` means opponents wait for the
  **Advance** button, which runs them up to your turn.
- The amber **MOCK DRAFT** banner stays up the whole time; **Stop** ends it.
- Opponents draft by room ADP with per-session random jitter (rerun for a different
  room), hold K/DST until their last two rounds, and cap QB/TE at 2.
- On your turn the usual violet panel appears and a display-only 90s countdown runs in
  the banner — it goes red when it expires, nothing auto-picks. **ME** buttons draft
  into the mock.
- After pick 168 a recap card shows final capture, your roster, and your top-5 value
  picks vs room ADP.
- Guards: a mock refuses to start if any real picks exist or live poll is on; live poll,
  **Refresh data**, and manual marks are refused while a mock is active.
- API: `POST /api/mock` with `{"action":"start","pace":0,"seed":42}` /
  `{"action":"advance"}` / `{"action":"pick","playerId":"p-…"}` / `{"action":"stop"}`;
  `GET /api/state` carries a `mock` block.

## If something else breaks

- **Server crashed / laptop rebooted**: rerun `cd nodejs/football/web && pnpm serve`. All
  state (polled picks, manual marks) is in SQLite and reloads.
- **Server up but page weird**: hard-reload the browser; the page holds no state worth
  keeping.
- **API by hand** (all on 127.0.0.1:8020): `GET /api/state`, `GET /api/board`,
  `GET /api/evaluate`, `GET /api/news/p-…`, `POST /api/poll {"enabled":true|false}`,
  `POST /api/mark {"playerId":"p-…","teamId":13|"unknown"}`,
  `POST /api/unmark {"playerId":"p-…"}`,
  `POST /api/override {"playerId":"p-…","action":"ban"|"boost"|"clear","points":25,"note":"…"}`,
  `POST /api/manual/reset`, `POST /api/refresh`.

## Environment knobs (all optional)

| Var                   | Default                                  |
| --------------------- | ---------------------------------------- |
| `PORT`                | 8020                                     |
| `FOOTBALL_DB`         | `nodejs/football/data/.data/football.db` |
| `FOOTBALL_SEASON`     | 2026                                     |
| `FOOTBALL_TEAM_ID`    | 13                                       |
| `FOOTBALL_OVERRIDES`  | `nodejs/football/overrides.json`         |
| `FOOTBALL_ROOM_RULES` | `nodejs/football/design/room-rules.json` |
| `FOOTBALL_EVAL`       | `mc` (`det` = deterministic fallback)    |
| `FOOTBALL_EVAL_K`     | 300 (MC scenarios per candidate)         |

## Overrides (optional)

`nodejs/football/overrides.json` — a JSON array of `{"player": "Name or p-id", "action":
"ban"}` or `{"player": "...", "action": "boost", "points": 25}` — loads at server start and
on every **Refresh data**. Boosts shift a player's projected points before VOR/tiers/
rollouts (▲ marker on the board); bans keep him visible but out of every recommendation
(muted row, BAN chip). A broken file never blocks the board: the server serves without
overrides and surfaces the error in the status bar's data tooltip.

The news drawer's **Ban / Boost / Un-ban** buttons edit this same file and hot-reload it,
so hand edits and button edits coexist; hand edits still need a **Refresh data** (or
restart) to load.
