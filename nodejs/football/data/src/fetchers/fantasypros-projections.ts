import type { ScoringFormat } from '../reference/scoring-format.js'
import { STAT_KEY_MAPPINGS, type StatKey } from '../reference/stat-key.js'
import { BROWSER_USER_AGENT, FetchError, fetchJson, fetchText } from './http.js'

/** K and DST stat vocabularies are deferred, so only the skill-position pages are scraped. */
export const FP_PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

export type FpProjectionPosition = (typeof FP_PROJECTION_POSITIONS)[number]

/** `week=draft` selects the season-total (draft) projections; verified against the live pages. */
const projectionUrl = (position: FpProjectionPosition): string =>
  `https://www.fantasypros.com/nfl/projections/${position.toLowerCase()}.php?week=draft`

export interface FpProjectionRow {
  /** FantasyPros player id, from the row's `fp-id-{n}` anchor class (same id space as ecrData). */
  fpId: number
  name: string
  /** Player page basename, e.g. `josh-allen-qb` from `/nfl/projections/josh-allen-qb.php`. */
  filename: string
  /** Raw FantasyPros team code (`JAC`, `LAR` divergences included); empty cell → null. */
  team: string | null
  stats: Partial<Record<StatKey, number>>
  /** The source's scored total under an initially-untrusted format: the page's FPTS column, or
   *  the API's `points_half`. The ingest determines the actual format by rescoring (validate.ts). */
  fpts: number
  /** Full per-format prescored set where the source provides one (the API); scrape rows carry
   *  only `fpts` and get their prescored entry filled after format determination. */
  prescored?: Partial<Record<ScoringFormat, number>>
}

export class FpProjectionParseError extends Error {
  constructor(position: FpProjectionPosition, detail: string) {
    super(`Failed to parse FantasyPros ${position} projections table: ${detail}`)
    this.name = 'FpProjectionParseError'
  }
}

/** Column layout per position page: grouped header label → canonical keys, in column order.
 *  Header meaning is positional (ATT is passing on /qb.php, rushing on /rb.php). */
const TABLE_LAYOUTS: Record<FpProjectionPosition, { group: string; keys: StatKey[] }[]> = {
  QB: [
    { group: 'PASSING', keys: ['passAtt', 'passCmp', 'passYd', 'passTd', 'passInt'] },
    { group: 'RUSHING', keys: ['rushAtt', 'rushYd', 'rushTd'] },
    { group: 'MISC', keys: ['fumLost'] },
  ],
  RB: [
    { group: 'RUSHING', keys: ['rushAtt', 'rushYd', 'rushTd'] },
    { group: 'RECEIVING', keys: ['rec', 'recYd', 'recTd'] },
    { group: 'MISC', keys: ['fumLost'] },
  ],
  WR: [
    { group: 'RECEIVING', keys: ['rec', 'recYd', 'recTd'] },
    { group: 'RUSHING', keys: ['rushAtt', 'rushYd', 'rushTd'] },
    { group: 'MISC', keys: ['fumLost'] },
  ],
  TE: [
    { group: 'RECEIVING', keys: ['rec', 'recYd', 'recTd'] },
    { group: 'MISC', keys: ['fumLost'] },
  ],
}

/** Expected header label for a stat column, from the single stat-identity authority. */
const headerFor = (key: StatKey): string => {
  const header = STAT_KEY_MAPPINGS[key].fpHeader
  if (header === null) {
    throw new Error(`StatKey ${key} has no FantasyPros header`)
  }
  return header
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * Parse one position page's `id="data"` stat table. The scrape is fragile by design: any
 * deviation from the expected structure — a renamed column, a shifted group, a non-numeric
 * cell — throws rather than yielding garbage rows.
 */
export const parseFpProjections = (html: string, position: FpProjectionPosition): FpProjectionRow[] => {
  const layout = TABLE_LAYOUTS[position]
  const statKeys = layout.flatMap((block) => block.keys)

  const anchor = html.indexOf('id="data"')
  if (anchor < 0) {
    throw new FpProjectionParseError(position, 'no id="data" table found')
  }
  const tableStart = html.lastIndexOf('<table', anchor)
  const tableEnd = html.indexOf('</table>', anchor)
  if (tableStart < 0 || tableEnd < 0) {
    throw new FpProjectionParseError(position, 'id="data" table markup is malformed')
  }
  const table = html.slice(tableStart, tableEnd)

  // -- Header guard: group row (labels + colspans) and column row must match exactly ---------
  const theadEnd = table.indexOf('</thead>')
  if (theadEnd < 0) {
    throw new FpProjectionParseError(position, 'no </thead> found')
  }
  const thead = table.slice(0, theadEnd)

  const groups = [...thead.matchAll(/<td colspan="(\d+)"[^>]*><small><b>([^<]+)<\/b><\/small><\/td>/g)].map((m) => ({
    colspan: Number(m[1]),
    label: m[2],
  }))
  // MISC covers the FL and FPTS columns.
  const expectedGroups = layout.map((block) => ({
    label: block.group,
    colspan: block.keys.length + (block.group === 'MISC' ? 1 : 0),
  }))
  const groupsMatch =
    groups.length === expectedGroups.length &&
    groups.every((g, i) => g.label === expectedGroups[i]?.label && g.colspan === expectedGroups[i]?.colspan)
  if (!groupsMatch) {
    throw new FpProjectionParseError(
      position,
      `header groups ${JSON.stringify(groups)} do not match expected ${JSON.stringify(expectedGroups)}`,
    )
  }

  const columns = [...thead.matchAll(/<th[^>]*><small>([^<]+)<\/small><\/th>/g)].map((m) => m[1] ?? '')
  const expectedColumns = [...statKeys.map(headerFor), 'FPTS']
  const columnsMatch =
    columns.length === expectedColumns.length && columns.every((label, i) => label === expectedColumns[i])
  if (!columnsMatch) {
    throw new FpProjectionParseError(
      position,
      `column headers [${columns.join(', ')}] do not match expected [${expectedColumns.join(', ')}]`,
    )
  }

  // -- Rows ----------------------------------------------------------------------------------
  const body = table.slice(theadEnd)
  const rows: FpProjectionRow[] = []
  for (const [tr] of body.matchAll(/<tr class="mpb-player-\d+[\s\S]*?<\/tr>/g)) {
    const label =
      /<a href="\/nfl\/projections\/([a-z0-9-]+)\.php" class="player-name fp-player-link fp-id-(\d+)"[^>]*fp-player-name="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*([A-Z]*)\s*<\/td>/.exec(
        tr,
      )
    if (!label) {
      throw new FpProjectionParseError(position, `player cell not recognized in row: ${tr.slice(0, 160)}`)
    }
    const filename = label[1] as string
    const fpId = label[2] as string
    const rawName = label[3] as string
    const team = label[4] as string

    const cells = [...tr.matchAll(/<td class="center"(?: data-sort-value="([\d.]+)")?>([\d,.]+)<\/td>/g)]
    if (cells.length !== statKeys.length + 1) {
      throw new FpProjectionParseError(
        position,
        `row for ${rawName} has ${cells.length} stat cells, expected ${statKeys.length + 1}`,
      )
    }
    const values = cells.map(([, sortValue, display], i) => {
      const value = Number((sortValue ?? display ?? '').replace(/,/g, ''))
      if (!Number.isFinite(value)) {
        throw new FpProjectionParseError(position, `non-numeric ${expectedColumns[i]} cell for ${rawName}`)
      }
      return value
    })

    const stats: Partial<Record<StatKey, number>> = {}
    statKeys.forEach((key, i) => {
      stats[key] = values[i]
    })
    rows.push({
      fpId: Number(fpId),
      name: decodeEntities(rawName),
      filename,
      team: team === '' ? null : team,
      stats,
      fpts: values[values.length - 1] as number,
    })
  }
  if (rows.length === 0) {
    throw new FpProjectionParseError(position, 'no player rows found')
  }
  return rows
}

/**
 * Fetch one position's season-total projections from the page (the fallback path). Anonymous
 * requests are registration-fenced to roughly the top ten rows per position (verified live
 * 2026-08-28) — the parser handles whatever the page serves and the ingest reports the counts.
 */
export const fetchFpProjections = async (position: FpProjectionPosition): Promise<FpProjectionRow[]> => {
  const html = await fetchText(projectionUrl(position), { 'user-agent': BROWSER_USER_AGENT })
  return parseFpProjections(html, position)
}

// -- Public API path --------------------------------------------------------------------------
//
// The free public API (`x-api-key` from FP_API_KEY) caps every response at 10 players whatever
// the matched `count` says (verified live 2026-08-28, filtered and unfiltered). Coverage beyond
// the cap comes from the `players` id filter: ranked FantasyPros ids batched 10 per call.

const FP_API_HOST = 'https://api.fantasypros.com/public/v2/json'

/** Free-tier responses never carry more than this many players. */
export const FP_API_BATCH_SIZE = 10

/** One `players[]` entry of the projections endpoint. */
export interface FpApiPlayer {
  fpid: number | string
  name: string
  position_id: string
  team_id: string
  filename: string
  stats: Record<string, number>
}

interface FpApiResponse {
  count?: string
  players?: FpApiPlayer[]
}

/** API stat field → canonical key. Prescored (`points*`), bonus-bucket (`*_yds_100` etc.),
 *  `ret_tds`, and `2pt_tds` fields are deliberately unmapped (all observed zero). */
const FP_API_STAT_FIELDS: ReadonlyMap<string, StatKey> = new Map([
  ['pass_att', 'passAtt'],
  ['pass_cmp', 'passCmp'],
  ['pass_yds', 'passYd'],
  ['pass_tds', 'passTd'],
  ['pass_ints', 'passInt'],
  ['rush_att', 'rushAtt'],
  ['rush_yds', 'rushYd'],
  ['rush_tds', 'rushTd'],
  ['rec_rec', 'rec'],
  ['rec_yds', 'recYd'],
  ['rec_tds', 'recTd'],
  ['fumbles', 'fumLost'], // matches the page's FL column (verified vs live pages)
])

export const chunkIds = (ids: number[], size: number = FP_API_BATCH_SIZE): number[][] => {
  const batches: number[][] = []
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size))
  }
  return batches
}

/** Parse one API response. An empty `players[]` is a legal batch result (none of the requested
 *  ids are projected); anything structurally unexpected throws rather than yielding garbage. */
export const parseFpApiPlayers = (response: unknown, position: FpProjectionPosition): FpProjectionRow[] => {
  const players = (response as FpApiResponse | null)?.players
  if (!Array.isArray(players)) {
    throw new FpProjectionParseError(position, 'API response has no players[]')
  }
  return players.map((player) => {
    const fpId = Number(player.fpid)
    if (!Number.isInteger(fpId) || typeof player.name !== 'string' || player.name === '') {
      throw new FpProjectionParseError(position, `API player lacks fpid/name: ${JSON.stringify(player).slice(0, 120)}`)
    }
    if (player.position_id !== position) {
      throw new FpProjectionParseError(position, `API returned position ${player.position_id} for ${player.name}`)
    }
    const rawStats = player.stats as Record<string, unknown> | undefined
    if (rawStats === undefined || typeof rawStats !== 'object') {
      throw new FpProjectionParseError(position, `API player ${player.name} has no stats object`)
    }
    const stats: Partial<Record<StatKey, number>> = {}
    for (const [field, key] of FP_API_STAT_FIELDS) {
      const value = rawStats[field]
      if (value === undefined) {
        continue
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new FpProjectionParseError(position, `non-numeric ${field} for ${player.name}: ${JSON.stringify(value)}`)
      }
      stats[key] = value
    }
    const prescored: Partial<Record<ScoringFormat, number>> = {}
    for (const [field, format] of [
      ['points', 'std'],
      ['points_half', 'half'],
      ['points_ppr', 'ppr'],
    ] as const) {
      const value = rawStats[field]
      if (typeof value === 'number' && Number.isFinite(value)) {
        prescored[format] = value
      }
    }
    if (prescored.half === undefined) {
      throw new FpProjectionParseError(position, `API player ${player.name} has no points_half`)
    }
    return {
      fpId,
      name: player.name,
      filename: typeof player.filename === 'string' ? player.filename.replace(/\.php$/, '') : '',
      team: typeof player.team_id === 'string' && player.team_id !== '' ? player.team_id : null,
      stats,
      fpts: prescored.half,
      prescored,
    }
  })
}

/** The free tier throttles bursts (HTTP 429 observed after ~5 rapid calls): pace batches, and
 *  when throttled anyway wait out the window before retrying. */
const FP_API_PACE_MS = 13_000
const FP_API_RATE_LIMIT_WAITS_MS = [65_000, 65_000]

const defaultSleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Run a request, waiting out the rate-limit window on 429; any other failure rethrows. */
export const withRateLimitRetry = async <T>(
  run: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<T> => {
  for (const wait of FP_API_RATE_LIMIT_WAITS_MS) {
    try {
      return await run()
    } catch (error) {
      if (!(error instanceof FetchError) || error.status !== 429) {
        throw error
      }
      await sleep(wait)
    }
  }
  return await run()
}

/**
 * Fetch one position's season projections (`week=0`) for the given FantasyPros ids, batched to
 * the free-tier response cap. Returns the projected subset — deep ids without projections simply
 * do not come back — plus the number of API calls spent (the key is budgeted per day).
 */
export const fetchFpApiProjections = async (
  season: number,
  position: FpProjectionPosition,
  fpIds: number[],
  apiKey: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ rows: FpProjectionRow[]; calls: number }> => {
  const rows: FpProjectionRow[] = []
  const seen = new Set<number>()
  let calls = 0
  for (const batch of chunkIds(fpIds)) {
    if (calls > 0) {
      await sleep(FP_API_PACE_MS)
    }
    const url = `${FP_API_HOST}/nfl/${season}/projections?position=${position}&week=0&players=${batch.join(':')}`
    const response = await withRateLimitRetry(async () => {
      calls++
      return await fetchJson<unknown>(url, { 'x-api-key': apiKey })
    }, sleep)
    for (const row of parseFpApiPlayers(response, position)) {
      if (!seen.has(row.fpId)) {
        seen.add(row.fpId)
        rows.push(row)
      }
    }
  }
  if (rows.length === 0) {
    throw new FpProjectionParseError(position, `API returned no projected players for ${fpIds.length} ranked ids`)
  }
  return { rows, calls }
}
