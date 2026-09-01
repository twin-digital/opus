# Realized draft capture — 2024 and 2025

What fraction of the theoretically available draft value did each team's picks actually deliver,
measured by real season outcomes?

```
capture = (realizedStarterTotal − realizedReplacementTotal) / (realizedCeilingTotal − realizedReplacementTotal)
```

Per season, under **that season's own league settings** (10 teams, QB/2RB/2WR/TE/FLEX, that
season's scoring rules from mSettings):

- **realizedStarterTotal** — best legal lineup from the team's _drafted_ players' realized
  season totals. Drafted rosters only, no waivers or trades: the number isolates draft quality,
  not season management.
- **realizedCeilingTotal** — best legal lineup from every NFL player's realized season total
  (the perfect-hindsight draft).
- **realizedReplacementTotal** — an all-replacement lineup, replacement levels computed over the
  realized pool with the league's size and slots (same `computeReplacementLevels` logic the live
  board uses).

Realized points are nflverse regular-season stat totals scored with `buildLeagueScorer` under the
season's actual rules. K/DST are excluded from every total uniformly (drafted K/DST picks, the
ceiling, and replacement) — nflverse player stats carry neither kickers nor team defenses.
ESPN pick ids join to nflverse gsis ids via the dynastyprocess crosswalk with a
name+position fallback; **all 240 picks across both drafts resolved (0 unmatched)**.

Produced by `compute/src/cli/realized-capture.ts` (`pnpm realized-capture` in the compute
package). Raw per-team numbers: [`realized-capture.json`](./realized-capture.json); derived
per-player realized points: `compute/experiments/realized-points-{2024,2025}.json`. Fetched
inputs (ESPN league history, nflverse CSVs, crosswalk) cache outside the repo
(`~/.cache/football-realized-capture` or `FOOTBALL_REALIZED_CACHE`) and re-fetch on demand.

## 2024 (ceiling 2241.2, replacement 1238.2)

| Owner             | Team                         | Id  | Slot | Realized starters |   Capture | Finish |
| ----------------- | ---------------------------- | --- | ---: | ----------------: | --------: | -----: |
| skow0020          | Everybody Hurts Sometimes    | 10  |    6 |            1855.1 | **61.5%** |      3 |
| ESPNFAN8670175346 | Won't you be my Nabers       | 9   |    8 |            1608.8 |     36.9% |      9 |
| ESPNFAN9844016607 | Team Lettow                  | 8   |    5 |            1592.8 |     35.4% |      4 |
| ESPNFAN5529081138 | JJ and the Jet               | 5   |    7 |            1539.8 |     30.1% |      8 |
| espn55194508      | King Kong                    | 7   |   10 |            1499.4 |     26.0% |      7 |
| espn70614675      | Breakin 2: Electric Boogaloo | 4   |    4 |            1453.4 |     21.5% |      5 |
| ESPNFAN5358890405 | Team Rush                    | 6   |    2 |            1446.6 |     20.8% |      2 |
| wollman19         | Chest Swollfman              | 1   |    9 |            1424.8 |     18.6% |      1 |
| sippys            | Boswell that Ends Well       | 3   |    3 |            1239.2 |      0.1% |      6 |
| SuperJ_Spartan    | Theo Von Retically           | 11  |    1 |            1179.4 |     −5.9% |     10 |

Spearman(capture, final finish): **ρ = 0.042** — effectively zero. The champion drafted 8th-best;
the best draft finished 3rd.

## 2025 (ceiling 2274.6, replacement 1219.6)

| Owner             | Team                        | Id  | Slot | Realized starters |   Capture | Finish | Autodraft |
| ----------------- | --------------------------- | --- | ---: | ----------------: | --------: | -----: | --------: |
| BK0hl             | Cache Money                 | 12  |    7 |            1740.6 | **49.4%** |      3 |           |
| skow0020          | La Porta Potty              | 10  |    5 |            1561.6 |     32.4% |      4 |           |
| SuperJ_Spartan    | Theo Von Retically          | 11  |    2 |            1502.8 |     26.8% |     10 |      2/14 |
| wollman19         | Purple Reign                | 1   |    8 |            1497.4 |     26.3% |      7 |           |
| espn70614675      | Vinz Clortho: The Keymaster | 4   |    1 |            1397.5 |     16.9% |      5 |           |
| desktophero       | No one healthy on BYE week  | 9   |   10 |            1374.4 |     14.7% |      9 |      2/14 |
| ESPNFAN9844016607 | Team Lettow                 | 8   |    9 |            1350.9 |     12.5% |      8 |      1/14 |
| ESPNFAN5529081138 | JJ and the Jet              | 5   |    4 |            1330.2 |     10.5% |  **1** | **14/14** |
| sippys            | Scottie Pickens JR          | 3   |    3 |            1282.2 |      5.9% |      2 |           |
| espn55194508      | King Kong                   | 7   |    6 |            1184.6 |     −3.3% |      6 |           |

Spearman(capture, final finish): **ρ = −0.152** — mildly _negative_. Team 5 won the 2025 title
off a full 14/14 autodraft board that captured 10.5% (8th of 10); the two best drafts finished
3rd and 4th; the 3rd-worst draft took 2nd.

## The read

Realized capture in this league clusters in a 10–35% band, with roughly one outlier draft per
year (61.5% in 2024, 49.4% in 2025) and the floor near 0% — against the perfect-hindsight
ceiling, even good human drafts leave two-thirds of the theoretically available value on the
board, mostly to injuries and breakouts nobody priced. The draft-to-finish correlation is
essentially zero across both seasons (ρ = 0.042 and −0.152, n = 10 each), so a strong draft
buys a strong roster floor, not a trophy — in-season variance, waivers, and matchups dominate a
10-team league's standings, as the 2025 full-autodraft title makes vivid. Calibration for a
live projected capture of 40–42%: that is not a modest number — projected capture is measured
against a projected ceiling (no hindsight), and its realized counterpart at the top of this
room's range is ~50–60% in a great year and ~30% for the second-best draft; a board tracking
40%+ live is drafting at or above the level of this league's best historical drafters.

### Caveats

- Drafted-roster-only is deliberate but harsh on teams that drafted early-season busts and
  patched via waivers; it grades the draft, not the season.
- K/DST excluded everywhere, so totals sit slightly below true lineup totals; the exclusion is
  uniform across teams, ceiling, and replacement, leaving capture comparable.
- nflverse pool covers QB/RB/WR/TE with regular-season stat lines; a drafted player with no
  stat rows (season-long injury) counts as a 0-point pick.
