import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import type { EspnLeagueCredentials } from '../fetchers/espn.js'
import { FP_PROJECTIONS_MODES, runIngest, type FpProjectionsMode, type IngestSummary } from '../ingest/pipeline.js'

const packageDir = path.resolve(fileURLToPath(import.meta.url), '../../..')

// Creds may live beside the package or one level up (nodejs/football/.env).
loadDotenv({ path: [path.join(packageDir, '.env'), path.resolve(packageDir, '../.env')], quiet: true })

const espnCreds = (): EspnLeagueCredentials | null => {
  const leagueId = process.env.ESPN_LEAGUE_ID
  const espnS2 = process.env.ESPN_S2
  const swid = process.env.ESPN_SWID
  if (leagueId === undefined || espnS2 === undefined || swid === undefined) {
    return null
  }
  return { leagueId, espnS2, swid }
}

const printSummary = (summary: IngestSummary): void => {
  console.log('\n=== Ingest summary ===')
  console.log(`season: ${summary.season}`)
  console.log(`asOf:   ${summary.asOf}`)
  console.log(`FantasyPros rankings last updated: ${summary.fantasyProsLastUpdated ?? 'unknown'}`)
  const fp = summary.fantasyProsProjections
  const fpSource =
    fp.path === 'skip' ? `kept from prior run (asOf ${fp.keptAsOf ?? 'none'})`
    : fp.path === 'api' ? `API (${fp.apiCalls} calls)`
    : 'page scrape (fenced)'
  console.log(`FantasyPros projections: ${fpSource} — ${formatCounts(fp.rowsByPosition)}`)
  console.log('\nRows per table:')
  console.log(`  player:            ${summary.players}`)
  const mappingTotal = Object.values(summary.mappingsBySource).reduce((a, b) => a + b, 0)
  console.log(`  player_id_mapping: ${mappingTotal}  (${formatCounts(summary.mappingsBySource)})`)
  const projectionTotal = Object.values(summary.projectionsBySource).reduce((a, b) => a + b, 0)
  console.log(`  season_projection: ${projectionTotal}  (${formatCounts(summary.projectionsBySource)})`)
  console.log(`  market_data:       ${summary.marketData}`)
  console.log(`  league_settings:   ${summary.leagueSettings}`)
  console.log(`  draft_pick:        ${summary.draftPicks}`)
  console.log('\nValidation:')
  console.log(
    `  sleeper prescored: ${summary.validation.sleeperChecked} checked, max delta ${summary.validation.sleeperMaxDelta.toFixed(3)}`,
  )
  console.log(
    `  espn appliedTotal: ${summary.validation.espnChecked} checked, max delta ${summary.validation.espnMaxDelta.toFixed(3)}`,
  )
  console.log(`  espn proTeamId spot checks: ${summary.validation.proTeamSpotChecks}`)
  console.log(
    summary.validation.fantasyProsFormat === null ?
      '  fantasypros FPTS:  skipped (kept prior rows)'
    : `  fantasypros FPTS:  ${summary.validation.fantasyProsChecked} checked, format ${summary.validation.fantasyProsFormat}, max delta ${summary.validation.fantasyProsMaxDelta.toFixed(3)}`,
  )
  console.log(`\nUnresolved players: ${summary.unresolved.length}`)
  for (const entry of summary.unresolved) {
    console.log(
      `  [${entry.source}] ${entry.externalId} ${entry.name} (${entry.team ?? 'FA'} ${entry.position}) — ${entry.reason}`,
    )
  }
  if (summary.leagueMessage !== null) {
    console.log(`\n${summary.leagueMessage}`)
  }
}

const fpProjectionsMode = (): FpProjectionsMode => {
  const mode = process.env.FP_PROJECTIONS_MODE ?? 'auto'
  if (!(FP_PROJECTIONS_MODES as readonly string[]).includes(mode)) {
    throw new Error(`FP_PROJECTIONS_MODE must be one of ${FP_PROJECTIONS_MODES.join('|')}, got ${JSON.stringify(mode)}`)
  }
  return mode as FpProjectionsMode
}

const main = async (): Promise<void> => {
  const season = Number(process.env.FOOTBALL_SEASON ?? '2026')
  const dbFile = process.env.FOOTBALL_DB ?? path.join(packageDir, '.data', 'football.db')
  console.log(`Ingesting season ${season} into ${dbFile}`)
  const summary = await runIngest({
    dbFile,
    season,
    espnCreds: espnCreds(),
    fpApiKey: process.env.FP_API_KEY ?? null,
    fpProjectionsMode: fpProjectionsMode(),
    log: (message) => {
      console.log(message)
    },
  })
  printSummary(summary)
}

const formatCounts = (counts: Record<string, number>): string =>
  Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')

main().catch((error: unknown) => {
  console.error('\nINGEST FAILED:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
