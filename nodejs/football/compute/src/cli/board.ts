import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { isPosition, openDatabase, Store, type PlayerId, type Position } from '@twin-digital/football-data'

import { board, type BoardRow, type BoardState } from '../board.js'
import { loadOverridesFile, type PlayerOverride } from '../overrides.js'
import { loadRoomRulesFile, pickThreats, type PlayerThreat, type RoomProfiles } from '../room-profiles.js'
import { evaluateCandidates, type CandidateEvaluation } from '../rollout.js'

const packageDir = path.resolve(fileURLToPath(import.meta.url), '../../..')
const DEFAULT_DB = path.join(packageDir, '..', 'data', '.data', 'football.db')
const DEFAULT_OVERRIDES = path.join(packageDir, '..', 'overrides.json')
const DEFAULT_ROOM_RULES = path.join(packageDir, '..', 'design', 'room-rules.json')

/** The owner's slot in league 1838733150 (teamId 13, slot 11 of 12) — a default, not a constant. */
const DEFAULT_SLOT = '11'
const DEFAULT_TEAM = '13'

const formatPoints = (value: number | null): string => (value === null ? '—' : value.toFixed(1))
const formatOdds = (value: number | null): string => (value === null ? '—' : `${String(Math.round(value * 100))}%`)
const formatInjury = (status: string): string => (status === 'ACTIVE' ? '' : status.slice(0, 4))
const formatDelta = (value: number | null): string =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(0)}`
const formatUpside = (value: number | null): string => (value === null ? '—' : String(Math.round(value)))

const THREAT_MARKS = ['', '!', '!!', '!!!'] as const

const printRows = (rows: BoardRow[], nextPicks: number[], threats?: Map<PlayerId, PlayerThreat>): void => {
  const threatMark = (row: BoardRow): string => THREAT_MARKS[threats?.get(row.playerId)?.threatLevel ?? 0]
  const header = [
    ['#', 4],
    ['PLAYER', 26],
    ...(threats === undefined ? [] : ([['THR', 4]] as const)),
    ['!', 2],
    ['POS', 4],
    ['TEAM', 5],
    ['BYE', 4],
    ['PTS', 7],
    ['VOR', 7],
    ['TIER', 5],
    ['ECR', 5],
    ['ADP', 6],
    ['ΔROOM', 6],
    ['UPS', 4],
    ['INJ', 5],
    [`P@${String(nextPicks[0] ?? '?')}`, 6],
    [`P@${String(nextPicks[1] ?? '?')}`, 6],
  ] as const
  console.log(header.map(([label, width]) => label.padEnd(width)).join(' '))
  for (const row of rows) {
    const cells: [string, number][] = [
      [String(row.rank), 4],
      [(row.banned ? '✕ ' : '') + row.name.slice(0, 24), 26],
      ...(threats === undefined ? [] : ([[threatMark(row), 4]] as [string, number][])),
      [row.contested ? '!' : '', 2], // sources genuinely disagree on his season
      [row.position, 4],
      [row.team ?? 'FA', 5],
      [row.byeWeek === null ? '—' : String(row.byeWeek), 4],
      [formatPoints(row.points), 7],
      [formatPoints(row.vor), 7],
      [row.tier === null ? '—' : String(row.tier), 5],
      [row.ecrRank === null ? '—' : String(row.ecrRank), 5],
      [row.adp === null ? '—' : row.adp.toFixed(1), 6],
      [formatDelta(row.roomDelta), 6],
      [formatUpside(row.upsideScore), 4],
      [formatInjury(row.injuryStatus), 5],
      [formatOdds(row.pNextPick), 6],
      [formatOdds(row.pPickAfter), 6],
    ]
    console.log(cells.map(([value, width]) => value.padEnd(width)).join(' '))
  }
}

/** Attribution lines for displayed rows that carry a mark and a named team. */
const printThreatAttributions = (rows: BoardRow[], threats: Map<PlayerId, PlayerThreat>): void => {
  const lines: string[] = []
  for (const row of rows) {
    const threat = threats.get(row.playerId)
    if (threat === undefined || threat.threatLevel === 0 || threat.attribution === null) {
      continue
    }
    const { attribution } = threat
    const who = `${attribution.ownerName ?? 'team ' + String(attribution.teamId)} (T${String(attribution.teamId)}, slot ${String(attribution.slot ?? '?')})`
    lines.push(
      `${THREAT_MARKS[threat.threatLevel].padEnd(3)} ${row.name} — ${(threat.pTakenBeforeMyPick * 100).toFixed(0)}% gone before pick ${String(threat.myPick)}; ${who} @ pick ${String(attribution.atPick)}: ${(attribution.probability * 100).toFixed(0)}% — ${attribution.evidence.join('; ')}`,
    )
  }
  if (lines.length > 0) {
    console.log('\nthreats:')
    for (const line of lines) {
      console.log(`  ${line}`)
    }
  }
}

const printCandidates = (evaluations: CandidateEvaluation[]): void => {
  const header = [
    ['#', 4],
    ['PLAYER', 26],
    ['POS', 4],
    ['PTS', 7],
    ['VOR', 7],
    ['EST TEAM', 9],
    ['Δ', 7],
    ['CAP%', 6],
    ['LANDS', 6],
    ['UPS', 4],
  ] as const
  console.log(header.map(([label, width]) => label.padEnd(width)).join(' '))
  evaluations.forEach((evaluation, i) => {
    const cells: [string, number][] = [
      [String(i + 1), 4],
      [evaluation.name.slice(0, 26), 26],
      [evaluation.position, 4],
      [formatPoints(evaluation.points), 7],
      [formatPoints(evaluation.vor), 7],
      [evaluation.estTeamScore.toFixed(1), 9],
      [evaluation.deltaVsBest.toFixed(1), 7],
      [`${(evaluation.captureRatio * 100).toFixed(0)}%`, 6],
      [evaluation.landsOn, 6],
      [formatUpside(evaluation.upsideScore), 4],
    ]
    console.log(cells.map(([value, width]) => value.padEnd(width)).join(' '))
  })
}

const main = (): void => {
  const { values } = parseArgs({
    options: {
      db: { type: 'string', default: process.env.FOOTBALL_DB ?? DEFAULT_DB },
      season: { type: 'string', default: process.env.FOOTBALL_SEASON ?? '2026' },
      slot: { type: 'string', default: DEFAULT_SLOT },
      team: { type: 'string', default: DEFAULT_TEAM }, // ESPN teamId whose picks are "mine"
      pos: { type: 'string' },
      limit: { type: 'string', default: '50' },
      drafted: { type: 'string' }, // comma-separated player ids; default = draft_pick table
      mine: { type: 'string' }, // comma-separated player ids I hold; default = my team's draft picks
      overrides: { type: 'string' }, // overrides.json path; default nodejs/football/overrides.json if present
      evaluate: { type: 'boolean', default: false },
      threats: { type: 'boolean', default: false }, // threat column + attribution lines
      rules: { type: 'string' }, // room-rules.json path; default nodejs/football/design/room-rules.json
      'no-profiles': { type: 'boolean', default: false }, // pure-ADP room model
    },
  })
  const season = Number(values.season)
  const slot = Number(values.slot)
  const myTeamId = Number(values.team)
  let position: Position | undefined
  if (values.pos !== undefined) {
    const upper = values.pos.toUpperCase()
    if (!isPosition(upper)) {
      throw new Error(`unknown position: ${values.pos}`)
    }
    position = upper
  }

  const store = new Store(openDatabase(values.db))
  const settings = store.getLeagueSettings()
  if (settings === null) {
    throw new Error(`no league_settings in ${values.db} — run \`pnpm ingest\` in the data package first`)
  }
  const storePicks = store.getDraftPicks()
  const draftedPlayerIds =
    values.drafted !== undefined ?
      (values.drafted.split(',').filter((id) => id.length > 0) as PlayerId[])
    : storePicks.map((pick) => pick.playerId)
  const myDraftedPlayerIds =
    values.mine !== undefined ?
      (values.mine.split(',').filter((id) => id.length > 0) as PlayerId[])
    : storePicks.filter((pick) => pick.teamId === myTeamId).map((pick) => pick.playerId)

  const players = store.getPlayers()
  let overrides: PlayerOverride[] = []
  const overridesPath = values.overrides ?? (existsSync(DEFAULT_OVERRIDES) ? DEFAULT_OVERRIDES : undefined)
  if (overridesPath !== undefined) {
    overrides = loadOverridesFile(overridesPath, players)
    console.error(`overrides: ${String(overrides.length)} from ${overridesPath}`)
  }

  let profiles: RoomProfiles | undefined
  const rulesPath = values.rules ?? (existsSync(DEFAULT_ROOM_RULES) ? DEFAULT_ROOM_RULES : undefined)
  if (!values['no-profiles'] && rulesPath !== undefined) {
    profiles = loadRoomRulesFile(rulesPath, players, (message) => {
      console.error(`room-rules: ${message}`)
    })
    const ruleCount = [...profiles.teams.values()].reduce(
      (sum, team) => sum + team.posRules.length + team.loyalty.size,
      0,
    )
    console.error(`room profiles: ${String(ruleCount)} team rules from ${rulesPath}`)
  }

  const state: BoardState = {
    settings,
    players,
    projections: store.getProjections(season),
    market: store.getMarketData(),
    draftedPlayerIds,
    myDraftedPlayerIds,
    myDraftSlot: slot,
    season,
  }
  const result = board(state, {
    position,
    overrides,
    log: (message) => {
      console.error(message)
    },
  })

  // Persist the consensus rows so the store carries the doc's `source: 'consensus'` projection.
  store.replaceProjections('consensus', season, result.consensus, new Date().toISOString())

  console.log(
    `${settings.name} — pick ${String(result.currentOverall)} on the clock; slot ${String(slot)} picks next at ${result.myNextPicks.join(', ')}`,
  )
  const replacement = (['QB', 'RB', 'WR', 'TE'] as const)
    .map(
      (pos) =>
        `${pos}${String(result.replacement.rank[pos] ?? '?')} @ ${(result.replacement.points[pos] ?? 0).toFixed(1)}`,
    )
    .join('  ')
  console.log(`replacement levels: ${replacement}`)
  console.log(
    `benchmarks: ceiling ${result.benchmarks.ceiling.toFixed(1)}  replacement ${result.benchmarks.replacement.toFixed(1)}  capture so far ${(result.captureRatio * 100).toFixed(0)}%\n`,
  )

  if (values.evaluate) {
    const evaluations = evaluateCandidates(state, { overrides, profiles })
    printCandidates(evaluations.slice(0, Number(values.limit)))
    return
  }

  let threats: Map<PlayerId, PlayerThreat> | undefined
  if (values.threats && profiles !== undefined && result.myNextPicks[0] !== undefined) {
    threats = pickThreats(
      profiles,
      settings.draft.pickOrder,
      result.currentOverall,
      result.myNextPicks[0],
      result.rows,
      {
        myTeamId,
      },
    )
  }
  const shown = result.rows.slice(0, Number(values.limit))
  printRows(shown, result.myNextPicks, threats)
  if (threats !== undefined) {
    printThreatAttributions(shown, threats)
  }
}

main()
