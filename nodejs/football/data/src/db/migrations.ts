/**
 * Ordered, append-only migrations. Applied ids are recorded in `migration`; never edit a
 * shipped entry — add a new one. HistoricalGameStat (post-draft phase) lands as a later entry.
 */
export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: '0001-initial-schema',
    sql: `
      CREATE TABLE player (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        position      TEXT NOT NULL,
        team          TEXT,
        bye_week      INTEGER,
        age           REAL,
        years_exp     INTEGER,
        injury_status TEXT NOT NULL DEFAULT 'UNKNOWN',
        as_of         TEXT NOT NULL
      );

      -- The persistent identity ledger: extended, never replaced. No FK to player — a mapping
      -- may reference a player that is not fantasy-relevant in the current snapshot.
      CREATE TABLE player_id_mapping (
        player_id   TEXT NOT NULL,
        source      TEXT NOT NULL,
        external_id TEXT NOT NULL,
        matched_by  TEXT NOT NULL,
        PRIMARY KEY (source, external_id)
      );
      CREATE INDEX idx_player_id_mapping_player ON player_id_mapping(player_id);

      CREATE TABLE season_projection (
        player_id    TEXT NOT NULL REFERENCES player(id),
        source       TEXT NOT NULL,
        season       INTEGER NOT NULL,
        games_played REAL,
        stats        TEXT NOT NULL,   -- JSON Partial<Record<StatKey, number>>
        prescored    TEXT NOT NULL,   -- JSON Partial<Record<ScoringFormat, number>>
        as_of        TEXT NOT NULL,
        PRIMARY KEY (player_id, source, season)
      );

      CREATE TABLE market_data (
        player_id        TEXT PRIMARY KEY REFERENCES player(id),
        adp              TEXT NOT NULL,  -- JSON per-source, per-format
        ecr              TEXT,           -- JSON or NULL
        percent_rostered REAL,
        as_of            TEXT NOT NULL
      );

      CREATE TABLE league_settings (
        league_id     TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        size          INTEGER NOT NULL,
        scoring_rules TEXT NOT NULL,  -- JSON ScoringRule[]
        lineup_slots  TEXT NOT NULL,  -- JSON Record<LineupSlot, number>
        draft         TEXT NOT NULL,  -- JSON { type, date, pickOrder }
        as_of         TEXT NOT NULL
      );

      CREATE TABLE draft_pick (
        overall    INTEGER PRIMARY KEY,
        round      INTEGER NOT NULL,
        round_pick INTEGER NOT NULL,
        team_id    INTEGER NOT NULL,
        player_id  TEXT NOT NULL REFERENCES player(id),
        is_keeper  INTEGER NOT NULL DEFAULT 0,
        as_of      TEXT NOT NULL
      );
    `,
  },
  {
    id: '0002-manual-pick',
    sql: `
      -- Draft-day fallback marks. No FK to player: marks survive snapshot refreshes.
      CREATE TABLE manual_pick (
        player_id TEXT PRIMARY KEY,
        team_id   INTEGER,        -- NULL = drafted by an unknown team
        marked_at TEXT NOT NULL
      );
    `,
  },
  {
    id: '0003-player-news',
    sql: `
      -- Append-mostly news corpus. No FK to player: items survive snapshot refreshes.
      CREATE TABLE player_news (
        id          TEXT PRIMARY KEY,
        player_id   TEXT NOT NULL,
        source      TEXT NOT NULL,  -- 'espn-news' | 'sleeper-injury'
        external_id TEXT NOT NULL,
        published   TEXT,
        headline    TEXT NOT NULL,
        body        TEXT,           -- raw text/html as served
        fetched_at  TEXT NOT NULL,
        UNIQUE (source, external_id)
      );
      CREATE INDEX idx_player_news_player ON player_news(player_id);

      CREATE TABLE news_assessment (
        news_id     TEXT PRIMARY KEY REFERENCES player_news(id),
        direction   TEXT NOT NULL CHECK (direction IN ('improves', 'harms', 'unclear')),
        impact      TEXT NOT NULL CHECK (impact IN ('low', 'med', 'high')),
        summary     TEXT NOT NULL,
        assessed_at TEXT NOT NULL,
        assessed_by TEXT NOT NULL
      );
    `,
  },
]
