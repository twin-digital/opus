/**
 * Realized draft capture for past seasons: for each team in a historical draft, the fraction
 * of the theoretically available draft value its picks actually delivered, measured by real
 * season outcomes — capture = (realizedStarters − realizedReplacement) / (realizedCeiling −
 * realizedReplacement). Drafted rosters only (no waivers), so the number isolates draft
 * quality; K/DST are excluded from every total (nflverse player stats carry neither).
 *
 *   pnpm exec tsx src/cli/realized-capture.ts --season 2024 --season 2025
 *
 * Inputs are fetched once into a cache directory outside the repo (--cache, default
 * ~/.cache/football-realized-capture) and reused offline afterwards: ESPN league history
 * (needs ESPN_S2/ESPN_SWID, loaded from the football .env like ingest), nflverse
 * player_stats CSVs, and the dynastyprocess id crosswalk. Derived per-player realized season
 * points land in compute/experiments/realized-points-<season>.json; the per-team results in
 * football/design/realized-capture.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'
import {
  mapLeagueSettings,
  STAT_KEY_MAPPINGS,
  type LeagueSettings,
  type Position,
  type StatKey,
} from '@twin-digital/football-data'

import { buildLeagueScorer } from '../rescore.js'
import { bestLineup, lineupTotalWithReplacement } from '../roster.js'
import { computeReplacementLevels } from '../vor.js'

const packageDir = path.resolve(fileURLToPath(import.meta.url), '../../..')
const footballDir = path.resolve(packageDir, '..')
loadDotenv({ path: [path.join(footballDir, '.env')], quiet: true })

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID ?? '1838733150'
const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
/** Older seasons ship as player_stats_<season>.csv; 2025+ live in the stats_player release,
 * which renamed the passing-interceptions column. */
const NFLVERSE_ASSETS = (season: number): { name: string; url: string }[] => [
  { name: `player_stats_${String(season)}.csv`, url: `${NFLVERSE}/player_stats/player_stats_${String(season)}.csv` },
  {
    name: `stats_player_reg_${String(season)}.csv`,
    url: `${NFLVERSE}/stats_player/stats_player_reg_${String(season)}.csv`,
  },
]
const COLUMN_ALIASES: Record<string, string[]> = { interceptions: ['interceptions', 'passing_interceptions'] }
const CROSSWALK_URL = 'https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv'
const SKILL: readonly Position[] = ['QB', 'RB', 'WR', 'TE']
const ESPN_POSITIONS: Record<number, Position> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' }

// -- csv --------------------------------------------------------------------

/** Minimal RFC-4180 row reader (quoted fields, embedded commas/newlines). */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch ?? ''
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1
      }
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') {
        rows.push(row)
      }
      row = []
    } else {
      field += ch ?? ''
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// -- cached fetches ---------------------------------------------------------

const fetchToCache = async (cacheDir: string, name: string, url: string, headers: Record<string, string> = {}) => {
  const file = path.join(cacheDir, name)
  if (existsSync(file)) {
    return file
  }
  process.stderr.write(`fetching ${name}...\n`)
  const response = await fetch(url, { headers, redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`GET ${url} → ${String(response.status)}`)
  }
  writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  return file
}

const espnHeaders = (): Record<string, string> => {
  const s2 = process.env.ESPN_S2
  const swid = process.env.ESPN_SWID
  if (s2 === undefined || swid === undefined) {
    throw new Error('ESPN_S2/ESPN_SWID not set (needed to fetch league history; cached files skip this)')
  }
  return { Cookie: `espn_s2=${s2}; SWID=${swid}` }
}

interface EspnPick {
  playerId: number
  teamId: number
  overallPickNumber: number
  roundId: number
  autoDraftTypeId: number
}

interface EspnLeague {
  id: number
  settings: Parameters<typeof mapLeagueSettings>[0]['settings']
  draftDetail: { picks: EspnPick[] }
  teams: { id: number; abbrev: string; name: string; primaryOwner: string; rankCalculatedFinal: number }[]
  members: { id: string; displayName: string }[]
}

const loadLeague = async (cacheDir: string, season: number): Promise<EspnLeague> => {
  const name = `league-${String(season)}.json`
  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}` +
    `?seasonId=${String(season)}&view=mDraftDetail&view=mTeam&view=mSettings`
  const file =
    existsSync(path.join(cacheDir, name)) ?
      path.join(cacheDir, name)
    : await fetchToCache(cacheDir, name, url, espnHeaders())
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as EspnLeague[]
  return parsed[0] as EspnLeague
}

/** ESPN player names for the name-fallback join (players_wl carries every id + fullName). */
const loadEspnPlayerNames = async (
  cacheDir: string,
  season: number,
): Promise<Map<number, { name: string; position: Position | null }>> => {
  const name = `players-${String(season)}.json`
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${String(season)}/players?scoringPeriodId=0&view=players_wl`
  const file = await fetchToCache(cacheDir, name, url, {
    ...espnHeaders(),
    'X-Fantasy-Filter': JSON.stringify({ filterActive: null }),
  })
  const rows = JSON.parse(readFileSync(file, 'utf8')) as { id: number; fullName: string; defaultPositionId: number }[]
  return new Map(
    rows.map((row) => [row.id, { name: row.fullName, position: ESPN_POSITIONS[row.defaultPositionId] ?? null }]),
  )
}

// -- realized stats ---------------------------------------------------------

export interface RealizedPlayer {
  gsisId: string
  name: string
  position: Position
  points: number
}

const NFLVERSE_COLUMNS = (Object.entries(STAT_KEY_MAPPINGS) as [StatKey, { nflverse: string[] }][]).flatMap(
  ([key, mapping]) => mapping.nflverse.map((column) => [key, column] as const),
)

/** Sum a season's REG weekly rows per player and score the season line under league rules. */
const realizedSeasonPoints = (
  csvFile: string,
  season: number,
  settings: LeagueSettings,
): Map<string, RealizedPlayer> => {
  const rows = parseCsv(readFileSync(csvFile, 'utf8'))
  const header = rows[0] as string[]
  const col = (name: string): number => {
    for (const candidate of COLUMN_ALIASES[name] ?? [name]) {
      const index = header.indexOf(candidate)
      if (index >= 0) {
        return index
      }
    }
    throw new Error(`nflverse csv missing column ${name}`)
  }
  const iId = col('player_id')
  const iName = col('player_display_name')
  const iPos = col('position')
  const iSeason = col('season')
  const iType = col('season_type')
  const statCols = NFLVERSE_COLUMNS.map(([key, column]) => [key, col(column)] as const)

  const totals = new Map<string, { name: string; position: string; stats: Partial<Record<StatKey, number>> }>()
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] as string[]
    if (Number(row[iSeason]) !== season || row[iType] !== 'REG') {
      continue
    }
    const id = row[iId] as string
    let entry = totals.get(id)
    if (entry === undefined) {
      entry = { name: row[iName] as string, position: row[iPos] as string, stats: {} }
      totals.set(id, entry)
    }
    for (const [key, index] of statCols) {
      const value = Number(row[index])
      if (!Number.isNaN(value) && value !== 0) {
        entry.stats[key] = (entry.stats[key] ?? 0) + value
      }
    }
  }

  const scorer = buildLeagueScorer(settings.scoringRules, () => undefined)
  const players = new Map<string, RealizedPlayer>()
  for (const [gsisId, entry] of totals) {
    if (!(SKILL as string[]).includes(entry.position)) {
      continue // K/DST and non-skill positions are outside every total
    }
    players.set(gsisId, {
      gsisId,
      name: entry.name,
      position: entry.position as Position,
      points: scorer.score(entry.stats),
    })
  }
  return players
}

// -- id join ----------------------------------------------------------------

const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?$/g, '')
    .replace(/[^a-z]/g, '')

interface Crosswalk {
  byEspnId: Map<number, string>
  byName: Map<string, string>
}

const loadCrosswalk = (csvFile: string): Crosswalk => {
  const rows = parseCsv(readFileSync(csvFile, 'utf8'))
  const header = rows[0] as string[]
  const iEspn = header.indexOf('espn_id')
  const iGsis = header.indexOf('gsis_id')
  const iName = header.indexOf('name')
  const iPos = header.indexOf('position')
  const byEspnId = new Map<number, string>()
  const byName = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] as string[]
    const gsis = row[iGsis]
    if (gsis === undefined || gsis === '') {
      continue
    }
    const espn = Number(row[iEspn])
    if (!Number.isNaN(espn) && row[iEspn] !== '') {
      byEspnId.set(espn, gsis)
    }
    const key = `${normalizeName(row[iName] ?? '')}|${row[iPos] ?? ''}`
    if (byName.has(key) && byName.get(key) !== gsis) {
      ambiguous.add(key)
    }
    byName.set(key, gsis)
  }
  for (const key of ambiguous) {
    byName.delete(key) // a name shared by two players resolves to neither
  }
  return { byEspnId, byName }
}

// -- capture ----------------------------------------------------------------

const spearman = (a: number[], b: number[]): number => {
  const rank = (values: number[]): number[] => {
    const sorted = values.map((value, index) => ({ value, index })).sort((x, y) => x.value - y.value)
    const ranks = new Array<number>(values.length)
    let i = 0
    while (i < sorted.length) {
      let j = i
      while (
        j + 1 < sorted.length &&
        (sorted[j + 1] as { value: number }).value === (sorted[i] as { value: number }).value
      ) {
        j += 1
      }
      const shared = (i + j) / 2 + 1
      for (let k = i; k <= j; k += 1) {
        ranks[(sorted[k] as { index: number }).index] = shared
      }
      i = j + 1
    }
    return ranks
  }
  const ra = rank(a)
  const rb = rank(b)
  const n = a.length
  const meanA = ra.reduce((sum, value) => sum + value, 0) / n
  const meanB = rb.reduce((sum, value) => sum + value, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (let k = 0; k < n; k += 1) {
    const da = (ra[k] as number) - meanA
    const db = (rb[k] as number) - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  return cov / Math.sqrt(varA * varB)
}

export interface TeamCapture {
  teamId: number
  abbrev: string
  teamName: string
  owner: string
  draftSlot: number
  autodraftPicks: number
  skillPicks: number
  kdstPicks: number
  unmatchedPicks: string[]
  realizedStarterTotal: number
  capture: number
  finalRank: number
}

export interface SeasonCapture {
  season: number
  leagueSize: number
  realizedCeiling: number
  realizedReplacement: number
  spearmanCaptureVsFinish: number
  teams: TeamCapture[]
}

const captureForSeason = async (cacheDir: string, season: number, crosswalk: Crosswalk): Promise<SeasonCapture> => {
  const league = await loadLeague(cacheDir, season)
  const settings = mapLeagueSettings({ id: league.id, settings: league.settings })
  const assets = NFLVERSE_ASSETS(season)
  let csvFile: string | null = null
  let assetName = ''
  // A cached asset wins outright so re-runs stay offline (the first asset 404s for 2025+).
  const cached = assets.find((asset) => existsSync(path.join(cacheDir, asset.name)))
  if (cached !== undefined) {
    csvFile = path.join(cacheDir, cached.name)
    assetName = cached.name
  }
  for (const asset of csvFile === null ? assets : []) {
    csvFile = await fetchToCache(cacheDir, asset.name, asset.url).catch(() => null)
    if (csvFile !== null) {
      assetName = asset.name
      break
    }
  }
  if (csvFile === null) {
    throw new Error(`no nflverse player stats asset found for ${String(season)}`)
  }
  const realized = realizedSeasonPoints(csvFile, season, settings)
  const pool = [...realized.values()].map((player) => ({
    playerId: player.gsisId as never,
    position: player.position,
    points: player.points,
  }))

  writeFileSync(
    path.join(packageDir, 'experiments', `realized-points-${String(season)}.json`),
    JSON.stringify(
      {
        season,
        source: `nflverse ${assetName} (REG rows summed per player, scored under the league's ${String(season)} rules)`,
        players: [...realized.values()].sort((a, b) => b.points - a.points),
      },
      null,
      2,
    ),
  )

  const replacement = computeReplacementLevels(pool, settings.lineupSlots, settings.size)
  const realizedCeiling = bestLineup(pool, settings.lineupSlots).total
  const realizedReplacement = lineupTotalWithReplacement([], settings.lineupSlots, replacement.points)

  const espnNames = await loadEspnPlayerNames(cacheDir, season)
  const memberById = new Map(league.members.map((member) => [member.id, member.displayName]))
  const teams: TeamCapture[] = []
  for (const team of league.teams) {
    const picks = league.draftDetail.picks.filter((pick) => pick.teamId === team.id)
    const roster: { playerId: string; position: Position; points: number }[] = []
    const unmatched: string[] = []
    let kdst = 0
    for (const pick of picks) {
      const espnInfo = espnNames.get(pick.playerId)
      if (pick.playerId < 0 || espnInfo?.position === 'K' || espnInfo?.position === 'DST') {
        kdst += 1
        continue
      }
      let gsis = crosswalk.byEspnId.get(pick.playerId)
      if (gsis === undefined && espnInfo !== undefined) {
        gsis = crosswalk.byName.get(`${normalizeName(espnInfo.name)}|${espnInfo.position ?? ''}`)
      }
      const player = gsis === undefined ? undefined : realized.get(gsis)
      if (player !== undefined) {
        roster.push({ playerId: player.gsisId, position: player.position, points: player.points })
      } else if (gsis !== undefined && espnInfo?.position !== null && espnInfo !== undefined) {
        // Known player, no REG stat rows: a zero-point season, not a join failure.
        roster.push({ playerId: gsis, position: espnInfo.position, points: 0 })
      } else {
        unmatched.push(`${String(pick.playerId)}:${espnInfo?.name ?? 'unknown'}`)
      }
    }
    const realizedStarterTotal = bestLineup(
      roster.map((row) => ({ playerId: row.playerId as never, position: row.position, points: row.points })),
      settings.lineupSlots,
    ).total
    teams.push({
      teamId: team.id,
      abbrev: team.abbrev,
      teamName: team.name,
      owner: memberById.get(team.primaryOwner) ?? team.primaryOwner,
      draftSlot: settings.draft.pickOrder.indexOf(team.id) + 1,
      autodraftPicks: picks.filter((pick) => pick.autoDraftTypeId !== 0).length,
      skillPicks: roster.length,
      kdstPicks: kdst,
      unmatchedPicks: unmatched,
      realizedStarterTotal,
      capture: (realizedStarterTotal - realizedReplacement) / (realizedCeiling - realizedReplacement),
      finalRank: team.rankCalculatedFinal,
    })
  }
  teams.sort((a, b) => b.capture - a.capture)
  return {
    season,
    leagueSize: settings.size,
    realizedCeiling,
    realizedReplacement,
    // capture negated so both variables rank 1 = best; rho > 0 = better drafts finish higher
    spearmanCaptureVsFinish: spearman(
      teams.map((team) => -team.capture),
      teams.map((team) => team.finalRank),
    ),
    teams,
  }
}

// -- main -------------------------------------------------------------------

const main = async () => {
  const { values } = parseArgs({
    options: {
      season: { type: 'string', multiple: true, default: ['2024', '2025'] },
      cache: {
        type: 'string',
        default: process.env.FOOTBALL_REALIZED_CACHE ?? path.join(os.homedir(), '.cache', 'football-realized-capture'),
      },
      out: { type: 'string', default: path.join(footballDir, 'design', 'realized-capture.json') },
    },
  })
  mkdirSync(values.cache, { recursive: true })
  const crosswalk = loadCrosswalk(await fetchToCache(values.cache, 'db_playerids.csv', CROSSWALK_URL))
  const seasons: SeasonCapture[] = []
  for (const season of values.season) {
    seasons.push(await captureForSeason(values.cache, Number(season), crosswalk))
  }
  const output = {
    generatedAt: new Date().toISOString(),
    method:
      'capture = (realizedStarterTotal − realizedReplacement) / (realizedCeiling − realizedReplacement); ' +
      "drafted rosters only, realized = nflverse REG season totals scored under that season's league rules; " +
      'K/DST excluded from all totals',
    seasons,
  }
  writeFileSync(values.out, JSON.stringify(output, null, 2))
  for (const season of seasons) {
    process.stdout.write(
      `\n${String(season.season)}: ceiling ${season.realizedCeiling.toFixed(1)}, replacement ${season.realizedReplacement.toFixed(1)}, ` +
        `spearman(capture, finish) ${season.spearmanCaptureVsFinish.toFixed(3)}\n`,
    )
    for (const team of season.teams) {
      process.stdout.write(
        `  slot ${String(team.draftSlot).padStart(2)}  ${team.owner.padEnd(16)} starters ${team.realizedStarterTotal.toFixed(1).padStart(7)}  ` +
          `capture ${(team.capture * 100).toFixed(1).padStart(5)}%  finish ${String(team.finalRank).padStart(2)}` +
          (team.autodraftPicks > 0 ? `  (auto ${String(team.autodraftPicks)}/14)` : '') +
          (team.unmatchedPicks.length > 0 ? `  unmatched: ${team.unmatchedPicks.join(', ')}` : '') +
          '\n',
      )
    }
  }
}

await main()
