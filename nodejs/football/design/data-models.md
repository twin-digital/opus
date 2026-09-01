# Data models

Canonical models for everything the app ingests. Identity and closed-set values are defined here
first (canonical ids, reference data), then the models. Each model section gives the TypeScript
shape, then a field table: what the field feeds downstream, and exactly where each source
provides it. A `—` means the source does not carry the field.

## Sources and endpoints

| Source          | Access                                                | Endpoint / file                                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sleeper**     | free, no auth                                         | `GET https://api.sleeper.app/projections/nfl/{season}?season_type=regular&position[]={POS}` ("projections"); `GET https://api.sleeper.app/v1/players/nfl` ("players DB")                                                                                        |
| **ESPN**        | free; private leagues need `espn_s2` + `SWID` cookies | `GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}?view={view}` — views `kona_player_info` ("kona", needs `x-fantasy-filter` header for paging), `mSettings`, `mDraftDetail`, `mRoster`, `mTeam`       |
| **nflverse**    | free CSV/parquet, follow redirects                    | `https://github.com/nflverse/nflverse-data/releases/download/{release}/{file}` — releases `player_stats`, `snap_counts`, `schedules`, `injuries`; ID crosswalk from `https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv` ("db_playerids") |
| **FantasyPros** | free scrape (browser UA), personal use                | `https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php` — `ecrData` JSON embedded in page ("ecrData"); `https://www.fantasypros.com/nfl/projections/{pos}.php` HTML tables ("projection tables")                                                         |

## Identity

### Canonical player ids

The app mints its own player ids. No external id is the canonical one — every source id,
including nflverse's `gsis_id`, is an external id resolved through the id map.

```ts
/** App-minted: `<prefix>-<ulid>`, e.g. `p-01J8ZQ3M9WVXK2T7F0A1B2C3D4`. Assigned at first
 *  ingest, stable across seasons and team changes, never reused. */
type PlayerId = `p-${string}`
```

Ids are prefixed random ULIDs. The prefix names the entity type (readable in logs and foreign
keys); the ULID needs no seed data, so minting never depends on mutable source fields. Prefixes
are 1–3 characters — single characters are reserved for core, unambiguous entities.

| Prefix | Entity |
| ------ | ------ |
| `p`    | Player |

Future minted entities (e.g. an append-only market snapshot) register 2–3 character prefixes
here.

### `PlayerIdMapping`

One row per (source, external id). Seeded from db_playerids, which carries most of the pairings
in one file; extended whenever a source presents an id the map lacks.

```ts
interface PlayerIdMapping {
  playerId: PlayerId
  source: DataSource
  externalId: string // normalized to string regardless of source's native type
  matchedBy: 'crosswalk' | 'name-team-pos' | 'manual'
}
```

| Source      | External id           | Native format             | Where it appears                                                   | db_playerids column |
| ----------- | --------------------- | ------------------------- | ------------------------------------------------------------------ | ------------------- |
| Sleeper     | Sleeper player id     | numeric string (`"9221"`) | projections `player_id`; players DB key                            | `sleeper_id`        |
| ESPN        | ESPN player id        | number (`4429795`)        | kona `player.id`; mDraftDetail `picks[].playerId`; mRoster entries | `espn_id`           |
| nflverse    | GSIS id               | string (`"00-0038120"`)   | player_stats / snap_counts / injuries `player_id`                  | `gsis_id`           |
| FantasyPros | FantasyPros player id | number (`19788`)          | ecrData `player_id`                                                | `fantasypros_id`    |

Resolution order at ingest: exact match in the map → db_playerids re-check → normalized
name+team+position match (recorded as `matchedBy: 'name-team-pos'` and flagged for review) →
unresolved queue. Never silently joined on name alone. Rookies are the common gap: db_playerids
lags them, so draft-season ingests will exercise the fallback path.

Players are the only open-ended id space. Teams, positions, slots, and stats are closed sets and
are handled as static reference data below, not minted ids.

## Reference data

Canonical enums the app uses everywhere, with each source's native representation and the
mapping into canonical form. Ingest asserts on unknown values — a value outside these tables
fails loudly rather than passing through.

### `DataSource`

```ts
type DataSource = 'sleeper' | 'espn' | 'nflverse' | 'fantasypros'
```

### `Position`

```ts
type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
```

| Source      | Native format                                    | Values → canonical                                                                                                                                       |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleeper     | string `position` + string[] `fantasy_positions` | Map from `fantasy_positions[0]`, not `position` — depth roles appear there (`position: "FB"` with `fantasy_positions: ["RB"]`, observed). `DEF` → `DST`. |
| ESPN        | number `player.defaultPositionId`                | `1`→QB, `2`→RB, `3`→WR, `4`→TE, `5`→K, `16`→DST. 1–5 observed; 16 community-documented.                                                                  |
| nflverse    | strings `position`, `position_group`             | Map from `position_group` (`FB` rows group to `RB`). player_stats has no DST rows — team defense is out of scope for historicals.                        |
| FantasyPros | string `player_position_id`                      | `QB`/`RB`/`WR`/`TE`/`K`/`DST` verbatim. `pos_rank` embeds it (`"WR1"`).                                                                                  |

### `NflTeam`

Canonical: nflverse's 32 three-letter codes, adopted as-is so historical rows join without
translation.

```ts
type NflTeam =
  | 'ARI'
  | 'ATL'
  | 'BAL'
  | 'BUF'
  | 'CAR'
  | 'CHI'
  | 'CIN'
  | 'CLE'
  | 'DAL'
  | 'DEN'
  | 'DET'
  | 'GB'
  | 'HOU'
  | 'IND'
  | 'JAX'
  | 'KC'
  | 'LA'
  | 'LAC'
  | 'LV'
  | 'MIA'
  | 'MIN'
  | 'NE'
  | 'NO'
  | 'NYG'
  | 'NYJ'
  | 'PHI'
  | 'PIT'
  | 'SEA'
  | 'SF'
  | 'TB'
  | 'TEN'
  | 'WAS'
```

| Source      | Native format           | Divergences from canonical                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleeper     | string abbreviation     | `LAR` → `LA`; all 31 others match (full set observed). Free agent: `team: null`.                                                                                                                                                                                                                                                                                                                                                                                 |
| ESPN        | number `proTeamId`      | Full numeric map required: `1`→ATL, `2`→BUF, `3`→CHI, `4`→CIN, `5`→CLE, `6`→DAL, `7`→DEN, `8`→DET, `9`→GB, `10`→TEN, `11`→IND, `12`→KC, `13`→LV, `14`→LA, `15`→MIA, `16`→MIN, `17`→NE, `18`→NO, `19`→NYG, `20`→NYJ, `21`→PHI, `22`→ARI, `23`→PIT, `24`→LAC, `25`→SF, `26`→SEA, `27`→TB, `28`→WAS, `29`→CAR, `30`→JAX, `33`→BAL, `34`→HOU, `0`→free agent. Spot-verified (8=DET, 4=CIN, 14=LA, 1=ATL, 26=SEA); remainder community-documented — assert at ingest. |
| nflverse    | string abbreviation     | Canonical by definition. Historical rows use era codes: `OAK` (→ LV), `SD` (→ LAC), `STL` (→ LA) — remap when aggregating across relocations.                                                                                                                                                                                                                                                                                                                    |
| FantasyPros | string `player_team_id` | `LAR` → `LA`; free agent `FA` → null.                                                                                                                                                                                                                                                                                                                                                                                                                            |

### `LineupSlot`

```ts
type LineupSlot = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'DST' | 'K' | 'BENCH' | 'IR'

/** Positions eligible to fill each starting slot — drives VOR replacement ranks. */
const SLOT_ELIGIBILITY: Record<LineupSlot, Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  DST: ['DST'],
  K: ['K'],
  BENCH: [],
  IR: [],
}
```

ESPN is the only source with lineup slots. Its numeric ids (keys of
`mSettings.rosterSettings.lineupSlotCounts`, and `lineupSlotId` on draft picks/roster entries):
`0`→QB, `2`→RB, `4`→WR, `6`→TE, `23`→FLEX, `16`→DST, `17`→K, `20`→BENCH, `21`→IR. The
observed default-league payload uses exactly this subset with nonzero counts. Other ids (`3`
RB/WR, `5` WR/TE, `7` OP/superflex, `8`–`15` IDP, `18` P, `19` HC) exist in ESPN's scheme;
ingest asserts the league uses none of them, and supporting one becomes a deliberate change here
rather than a silent pass-through.

### `StatKey`

The single authority for stat identity across sources. Model tables below reference these keys
instead of repeating per-source identifiers.

```ts
type StatKey =
  | 'passAtt'
  | 'passCmp'
  | 'passYd'
  | 'passTd'
  | 'passInt'
  | 'rushAtt'
  | 'rushYd'
  | 'rushTd'
  | 'rec'
  | 'recTgt'
  | 'recYd'
  | 'recTd'
  | 'fumLost'
  | 'twoPtPass'
  | 'twoPtRush'
  | 'twoPtRec'
```

| Canonical   | Sleeper `stats.{key}` | ESPN statId | nflverse column                                                                | FP table header  |
| ----------- | --------------------- | ----------- | ------------------------------------------------------------------------------ | ---------------- |
| `passAtt`   | `pass_att`            | `0`         | `attempts`                                                                     | ATT (pass block) |
| `passCmp`   | `pass_cmp`            | `1`         | `completions`                                                                  | CMP              |
| `passYd`    | `pass_yd`             | `3`         | `passing_yards`                                                                | YDS (pass block) |
| `passTd`    | `pass_td`             | `4`         | `passing_tds`                                                                  | TDS (pass block) |
| `passInt`   | `pass_int`            | `20`        | `interceptions`                                                                | INTS             |
| `rushAtt`   | `rush_att`            | `23`        | `carries`                                                                      | ATT (rush block) |
| `rushYd`    | `rush_yd`             | `24`        | `rushing_yards`                                                                | YDS (rush block) |
| `rushTd`    | `rush_td`             | `25`        | `rushing_tds`                                                                  | TDS (rush block) |
| `rec`       | `rec`                 | `53`        | `receptions`                                                                   | REC              |
| `recTgt`    | —                     | `58`        | `targets`                                                                      | —                |
| `recYd`     | `rec_yd`              | `42`        | `receiving_yards`                                                              | YDS (rec block)  |
| `recTd`     | `rec_td`              | `43`        | `receiving_tds`                                                                | TDS (rec block)  |
| `fumLost`   | `fum_lost`            | `72`        | sum of `sack_fumbles_lost` + `rushing_fumbles_lost` + `receiving_fumbles_lost` | FL               |
| `twoPtPass` | `pass_2pt`            | `19`        | `passing_2pt_conversions`                                                      | —                |
| `twoPtRush` | `rush_2pt`            | `26`        | `rushing_2pt_conversions`                                                      | —                |
| `twoPtRec`  | `rec_2pt`             | `44`        | `receiving_2pt_conversions`                                                    | —                |

Format notes. Sleeper: flat float fields, snake_case, absent = zero. ESPN: numeric-string keys in
`player.stats[].stats`; the id table is community-documented (`cwendt94/espn-api` constants) with
partial direct verification — ingest cross-checks by rescoring `stats` under the league's rules
and comparing to `appliedTotal`. nflverse: one column per stat, zeros explicit. FantasyPros:
positional HTML table headers, so column meaning depends on position page (`ATT` is passing on
`/qb.php`, rushing on `/rb.php`); parse per-page, not by header name alone.

K and DST use disjoint stat vocabularies (FG distance buckets; sacks/takeaways/points-allowed
tiers). Both are late-round autopicks — their keys are deferred until the board needs them, and
they extend this same table when added.

### `InjuryStatus`

```ts
type InjuryStatus = 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'IR' | 'PUP' | 'SUSPENDED' | 'UNKNOWN'
```

| Source      | Native format                         | Values → canonical                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sleeper     | string-or-null `player.injury_status` | `null`/`""`→ACTIVE, `Questionable`→QUESTIONABLE, `Doubtful`→DOUBTFUL, `Out`→OUT, `IR`→IR, `PUP`→PUP, `Sus`→SUSPENDED, `NA`/`DNR`/`COV`→UNKNOWN. (Observed: empty, `Questionable`, `PUP`, `IR`, `NA`; remainder documented in Sleeper API docs.)              |
| ESPN        | string `player.injuryStatus`          | `ACTIVE`→ACTIVE, `QUESTIONABLE`→QUESTIONABLE (both observed); expected per community docs: `DOUBTFUL`, `OUT`, `INJURY_RESERVE`→IR, `SUSPENSION`→SUSPENDED, `PHYSICALLY_UNABLE_TO_PERFORM`→PUP, `DAY_TO_DAY`→QUESTIONABLE. Unknown values → UNKNOWN + logged. |
| nflverse    | `injuries` release, `report_status`   | `Questionable`/`Doubtful`/`Out` per week — historical context only, not the live flag.                                                                                                                                                                       |
| FantasyPros | —                                     | Not in ecrData.                                                                                                                                                                                                                                              |

### `ScoringFormat`

```ts
type ScoringFormat = 'std' | 'half' | 'ppr'
```

| Source      | How formats appear                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleeper     | Field suffixes/prefixes: `adp_std` / `adp_half_ppr` / `adp_ppr`, `pts_std` / `pts_half_ppr` / `pts_ppr`.                                                                                                         |
| ESPN        | Not an enum — the actual rule: `scoringItems[]` entry for statId `53` with `points` 0 / 0.5 / 1. Also kona `draftRanksByRankType` keys `STANDARD` / `PPR` (observed; plus `ELIMINATION`, `SUPERFLEX` — ignored). |
| nflverse    | Precomputed columns `fantasy_points` (std) and `fantasy_points_ppr` only; other formats recomputed from stat columns.                                                                                            |
| FantasyPros | Page variant: `cheatsheets.php` (std) / `half-point-ppr-cheatsheets.php` / `ppr-cheatsheets.php`; ecrData `scoring` field (`"PPR"` observed).                                                                    |

The league is half-PPR (verified from mSettings: statId 53 = 0.5). Half-PPR variants are the
primary market inputs — Sleeper `adp_half_ppr`, FantasyPros `half-point-ppr-cheatsheets.php`;
other formats are ingested only where they ride along for free, for context display.

### `SeasonType`

```ts
type SeasonType = 'REG' // the app only handles regular season
```

Native values to filter on: Sleeper query param `season_type=regular`; nflverse `season_type`
column `REG` (vs `POST`); ESPN projection stat rows for the season ahead (`statSourceId: 1`)
are regular-season by construction. FantasyPros draft pages are inherently regular-season.

## `Player`

Identity and draft-day attributes. One row per NFL player; every other model references
`Player.id`. External ids live in `PlayerIdMapping`, not here.

```ts
interface Player {
  id: PlayerId
  name: string
  position: Position
  team: NflTeam | null // null = free agent
  byeWeek: number | null
  age: number | null
  yearsExp: number | null
  injuryStatus: InjuryStatus
}
```

| Field          | Needed for                                                      | Sleeper                                                                                              | ESPN                                           | nflverse                                                        | FantasyPros                                         |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `id`           | join key across all models                                      | via `PlayerIdMapping`                                                                                | via `PlayerIdMapping`                          | via `PlayerIdMapping`                                           | via `PlayerIdMapping`                               |
| `name`         | display; last-resort match input                                | players DB `first_name`+`last_name`                                                                  | kona `player.fullName`                         | db_playerids `name`, `merge_name` (pre-normalized for matching) | ecrData `player_name`                               |
| `position`     | replacement level and tiers are per position                    | `fantasy_positions[0]` (see Position table)                                                          | `defaultPositionId` (see Position table)       | `position_group` (see Position table)                           | `player_position_id`                                |
| `team`         | depth-chart context; stacking warnings                          | players DB `team` (see NflTeam table)                                                                | `proTeamId` (see NflTeam table)                | db_playerids `team`                                             | `player_team_id` (see NflTeam table)                |
| `byeWeek`      | roster-construction warning: too many starters sharing a bye    | —                                                                                                    | derivable from pro-team schedule views         | derivable from `schedules` release                              | ecrData `player_bye_week` (direct — primary source) |
| `age`          | uncertainty archetypes: aging-RB left tail, young-WR right tail | —                                                                                                    | —                                              | db_playerids `age`, `birthdate`                                 | —                                                   |
| `yearsExp`     | breakout heuristics (year-2/3 WR)                               | players DB `years_exp`                                                                               | —                                              | db_playerids `draft_year` (derive)                              | —                                                   |
| `injuryStatus` | draft-day flag on the board                                     | `player.injury_status` (see InjuryStatus table; also `injury_body_part`, `injury_notes` for display) | `player.injuryStatus` (see InjuryStatus table) | —                                                               | —                                                   |

## `LeagueSettings`

The league's exact scoring and lineup rules. Everything downstream (rescoring, VOR, tiers) is
computed against these, never against generic PPR assumptions. ESPN-only — it is the league host.

```ts
interface LeagueSettings {
  leagueId: string
  name: string
  size: number // 12
  scoringRules: ScoringRule[]
  lineupSlots: Record<LineupSlot, number> // e.g. { QB:1, RB:2, WR:2, TE:1, FLEX:1, DST:1, K:1, BENCH:7, IR:1 }
  draft: {
    type: 'snake'
    date: string | null
    pickOrder: number[] // team ids in round-1 order
  }
}

interface ScoringRule {
  stat: StatKey | { espnStatId: number } // canonical when mapped; raw id for exotic rules (yardage bonuses)
  points: number // e.g. rec: 1.0 (PPR), passInt: -2
}
```

| Field                       | Needed for                                                                           | Sleeper | ESPN                                                                                                        | nflverse | FantasyPros |
| --------------------------- | ------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| `size`                      | replacement level = starters × size; make-it-back arithmetic (picks between turns)   | —       | mSettings `settings.size`                                                                                   | —        | —           |
| `scoringRules`              | the rescoring engine: stat-line projections × these rules = league-exact points      | —       | mSettings `settings.scoringSettings.scoringItems[]` (`statId` → StatKey table, `points`, `pointsOverrides`) | —        | —           |
| `lineupSlots`               | VOR replacement ranks per position (2 RB + FLEX in 12 teams ⇒ RB replacement ≈ RB28) | —       | mSettings `settings.rosterSettings.lineupSlotCounts` (numeric ids → LineupSlot table)                       | —        | —           |
| `draft.type` / `draft.date` | board mode; countdown                                                                | —       | mSettings `settings.draftSettings`                                                                          | —        | —           |
| `draft.pickOrder`           | your slot ⇒ exact pick numbers ⇒ make-it-back odds                                   | —       | mSettings `settings.draftSettings.pickOrder`                                                                | —        | —           |

## `SeasonProjection`

One row per (player, source): projected season stat line. Sources are kept separate; the
aggregator produces a synthetic `source: 'consensus'` row (robust mean), which the rescorer turns
into league points. Stat lines — not pre-scored points — so PPR and any league quirks apply
correctly.

```ts
interface SeasonProjection {
  playerId: PlayerId
  source: DataSource | 'consensus'
  season: number
  gamesPlayed: number | null
  stats: Partial<Record<StatKey, number>>
  /** Source's own scored totals, kept only to cross-check the rescorer. */
  prescored: Partial<Record<ScoringFormat, number>>
}
```

ESPN serves projections per week (`statSourceId: 1` = projection, `0` = actual); the ingest sums
weeks to season totals. Sleeper and FantasyPros are already season-total. Per-source stat
identifiers are the StatKey table's; this table gives the container each source serves them in.

| Field                       | Needed for                                                                        | Sleeper                              | ESPN                           | nflverse | FantasyPros                               |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------ | -------- | ----------------------------------------- |
| `gamesPlayed`               | per-game normalization; injury-discount visibility                                | projections `stats.gp`               | count of projection weeks      | —        | —                                         |
| `stats` (passing keys)      | × scoring rules → points (QB value)                                               | projections `stats.*`                | kona `player.stats[].stats`    | —        | projection tables `/qb.php`               |
| `stats` (rushing keys)      | × scoring rules → points                                                          | projections `stats.*`                | kona `player.stats[].stats`    | —        | projection tables per position page       |
| `stats.rec`                 | × scoring rules → points; **the PPR field** — drives the PPR/standard value gap   | projections `stats.rec`              | kona, statId `53`              | —        | projection tables REC                     |
| `stats.recTgt`              | opportunity check vs. historicals (targets predict better than points)            | — (not projected)                    | kona, statId `58` when present | —        | — (not projected)                         |
| `stats.fumLost` / 2-pt keys | × scoring rules → points (minor)                                                  | projections `stats.*`                | kona `player.stats[].stats`    | —        | projection tables FL (2-pt not projected) |
| `prescored`                 | validation: our rescorer under default rules must reproduce these within rounding | `stats.pts_ppr/pts_half_ppr/pts_std` | `player.stats[].appliedTotal`  | —        | projection tables FPTS                    |

## `MarketData`

What everyone else thinks: market price (ADP) and expert consensus (ECR). One row per player.
Never mixed into projections — this model prices players, projections value them, and the board
shows the gap.

```ts
interface MarketData {
  playerId: PlayerId
  adp: Partial<Record<DataSource, Partial<Record<ScoringFormat, number>>>>
  ecr: {
    rank: number // consensus rank
    posRank: string // 'WR1'
    tier: number
    best: number
    worst: number
    stdDev: number // expert disagreement
  } | null
  percentRostered: number | null
  asOf: string // ADP moves daily in draft season
}
```

| Field                   | Needed for                                                                                                                                                  | Sleeper                                          | ESPN                                                                                   | nflverse | FantasyPros                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | -------- | ------------------------------------------ |
| `adp`                   | make-it-back odds (ADP vs. your next pick number); value-vs-price highlighting; ESPN ADP specifically predicts _this room_ (leaguemates draft on ESPN's UI) | projections `stats.adp_ppr/adp_half_ppr/adp_std` | kona `player.ownership.averageDraftPosition` (format = ESPN default)                   | —        | separate ADP page, optional third signal   |
| `ecr.rank/posRank`      | board ordering sanity check against our VOR ranking                                                                                                         | —                                                | kona `player.draftRanksByRankType.PPR` (ESPN's own rank, not consensus — context only) | —        | ecrData `rank_ecr`, `pos_rank`             |
| `ecr.tier`              | tier-cliff display: experts' tier breaks alongside our computed ones                                                                                        | —                                                | —                                                                                      | —        | ecrData `tier`                             |
| `ecr.best/worst/stdDev` | disagreement signal: high `rank_std` = volatile opinion = risk/upside flag                                                                                  | —                                                | —                                                                                      | —        | ecrData `rank_min`, `rank_max`, `rank_std` |
| `percentRostered`       | context; ~0% late-round flyers                                                                                                                              | —                                                | kona `player.ownership.percentOwned`                                                   | —        | ecrData `player_owned_avg`                 |
| `asOf`                  | staleness guard; re-ingest cadence in draft week                                                                                                            | response `updated_at`                            | fetch time                                                                             | —        | ecrData `last_updated`                     |

## `HistoricalGameStat`

One row per (player, season, week) from nflverse — the modeling substrate for the uncertainty
layer, not shown raw on the board. Play-by-play-derived usage fields are the point: opportunity
is sticky year-over-year, efficiency is noisy.

```ts
interface HistoricalGameStat {
  playerId: PlayerId
  season: number
  week: number
  team: NflTeam // era codes remapped per NflTeam table
  opponent: NflTeam
  stats: Partial<Record<StatKey, number>>
  airYards: number | null
  usage: {
    targetShare: number | null // share of team targets
    airYardsShare: number | null
    wopr: number | null // weighted opportunity rating
    snapShare: number | null // from snap_counts release
  }
  fantasyPointsPpr: number // nflverse's scoring, for backtests only
}
```

| Field                                  | Needed for                                                                                                                      | Sleeper | ESPN | nflverse                                                                      | FantasyPros |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ----------------------------------------------------------------------------- | ----------- |
| `playerId/season/week`                 | join keys; season aggregation                                                                                                   | —       | —    | player_stats `player_id` (GSIS → `PlayerIdMapping`), `season`, `week` (1999→) | —           |
| `stats`                                | rescoring past seasons under this league's rules (what would X have scored _here_); PPR sensitivity of past production          | —       | —    | player_stats columns per StatKey table                                        | —           |
| `airYards`                             | depth-of-target context for usage analysis                                                                                      | —       | —    | player_stats `receiving_air_yards`                                            | —           |
| `usage.targetShare/airYardsShare/wopr` | usage stickiness: flag projections implying an unprecedented usage jump; breakout detection                                     | —       | —    | player_stats `target_share`, `air_yards_share`, `wopr` (precomputed)          | —           |
| `usage.snapShare`                      | role confirmation (backfield committees)                                                                                        | —       | —    | `snap_counts` release, `offense_pct`                                          | —           |
| `fantasyPointsPpr`                     | uncertainty layer: backtest archived projections vs. outcomes → error distributions by position/archetype → floor/ceiling bands | —       | —    | player_stats `fantasy_points_ppr`                                             | —           |

## `DraftPick`

Live draft state, polled from ESPN during the draft. Drives the board: removes drafted players,
tracks every roster, feeds make-it-back updates.

```ts
interface DraftPick {
  overall: number
  round: number
  roundPick: number
  teamId: number // ESPN team id
  playerId: PlayerId // resolved from ESPN player id via PlayerIdMapping
  isKeeper: boolean
}
```

| Field                 | Needed for                                                                         | Sleeper | ESPN                                                 | nflverse | FantasyPros |
| --------------------- | ---------------------------------------------------------------------------------- | ------- | ---------------------------------------------------- | -------- | ----------- |
| `overall`             | picks-until-my-turn; tier-depletion rate                                           | —       | mDraftDetail `draftDetail.picks[].overallPickNumber` | —        | —           |
| `round` / `roundPick` | round-based heuristics (K/DST last-two-rounds nudge)                               | —       | `roundId`, `roundPickNumber`                         | —        | —           |
| `teamId`              | opponents' positional needs → predict their next picks → sharpen make-it-back odds | —       | `teamId`                                             | —        | —           |
| `playerId`            | strike from board; recompute tier scarcity                                         | —       | `playerId` → `PlayerIdMapping`                       | —        | —           |
| `isKeeper`            | pre-draft board seeding in keeper leagues                                          | —       | `keeper`                                             | —        | —           |

## Freshness

Refreshable models are **overwrite plus `asOf`** — each refresh replaces the stored rows and
stamps the fetch time. No snapshot history is kept; if a later version wants time-series signals
(ADP risers/fallers), snapshots become their own append-only entity rather than a change to
these models.

| Tier             | Models                                                                          | Cadence                                       | Why                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk, once       | `HistoricalGameStat`                                                            | one-time backfill                             | past seasons are final (nflverse corrections touch only the current season)                                                                         |
| Snapshot refresh | `Player`, `PlayerIdMapping`, `SeasonProjection`, `MarketData`, `LeagueSettings` | daily in draft week; final pull draft morning | roster cuts, injury news, and depth-chart moves reprice players daily; ADP reacts within hours; the commissioner can edit settings until draft time |
| Live poll        | `DraftPick`                                                                     | every few seconds, draft window only          | changes second-to-second during the draft, then frozen forever                                                                                      |

Staleness guard: the board displays each model's `asOf` and warns when a snapshot predates the
last refresh window — a draft run against yesterday's ADP should be a choice, not an accident.

## Cross-cutting notes

- **Aggregation shape**: sources → per-source `SeasonProjection` rows → consensus row → rescore
  with `LeagueSettings.scoringRules` → VOR/tiers. `MarketData` joins at the board, not before.
- **ESPN weekly→season**: sum projection weeks; keep the weekly rows too — they price bye/injury
  weeks into `gamesPlayed`.
- **Mapping assertions**: every community-documented numeric map (ESPN stat ids, proTeamId,
  lineup slots, position ids) is asserted at ingest — rescore-vs-`appliedTotal` for stats,
  known-player spot checks for teams — so a silent ESPN renumbering breaks the build, not the
  board.
- **DST and K**: modeled as players with position-specific stat lines; keys deferred (see
  StatKey). DST projections come from Sleeper position `DEF`.
- **Storage**: the local store is SQLite (`better-sqlite3`) — one file, real joins for board
  queries, no server to fail mid-draft.
- **Volatility**: ESPN's endpoints are undocumented and have moved hosts before. All ingest lands
  in a local store; draft day runs read-only against that store plus the single live
  `mDraftDetail` poll.
