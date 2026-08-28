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

2. **Start the server**:

   ```sh
   cd nodejs/football/web && pnpm serve
   ```

   It logs the league, your slot, whether creds are present, and the URL.

3. **Open the board**: <http://127.0.0.1:8020/>

   Sanity check before the draft starts: pick 1, T8 on the clock, "your picks 11, 14",
   `POLL OFF`. Flip **live poll** on once and confirm the pill goes `POLL OK Ns` — that is
   the end-to-end creds check. Leave it off until the draft starts if you like; it only
   polls while the toggle is on.

## During the draft

- Turn **live poll** on. Picks land on the board within ~5s of ESPN registering them.
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

## If something else breaks

- **Server crashed / laptop rebooted**: rerun `cd nodejs/football/web && pnpm serve`. All
  state (polled picks, manual marks) is in SQLite and reloads.
- **Server up but page weird**: hard-reload the browser; the page holds no state worth
  keeping.
- **API by hand** (all on 127.0.0.1:8020): `GET /api/state`, `GET /api/board`,
  `POST /api/poll {"enabled":true|false}`,
  `POST /api/mark {"playerId":"p-…","teamId":13|"unknown"}`,
  `POST /api/unmark {"playerId":"p-…"}`, `POST /api/refresh`.

## Environment knobs (all optional)

| Var                | Default                                  |
| ------------------ | ---------------------------------------- |
| `PORT`             | 8020                                     |
| `FOOTBALL_DB`      | `nodejs/football/data/.data/football.db` |
| `FOOTBALL_SEASON`  | 2026                                     |
| `FOOTBALL_TEAM_ID` | 13                                       |
