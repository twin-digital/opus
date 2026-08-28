import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import { FP_PROJECTIONS_MODES, type FpProjectionsMode } from '@twin-digital/football-data'
import { fetchEspnDraftDetail, type EspnLeagueCredentials } from '@twin-digital/football-data/fetchers/espn'

import { App } from '../app.js'
import { DraftPoller } from '../poller.js'
import { startServer } from '../server.js'

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

// The UI refresh exists for ADP/injury/roster churn; FP projections are quota-bound (50
// API calls/day) and don't move intraday, so the button defaults to keeping them.
const fpProjectionsMode = (): FpProjectionsMode => {
  const mode = process.env.FP_PROJECTIONS_MODE
  if (mode === undefined) {
    return 'skip'
  }
  if (!(FP_PROJECTIONS_MODES as readonly string[]).includes(mode)) {
    throw new Error(`invalid FP_PROJECTIONS_MODE: ${mode} (expected ${FP_PROJECTIONS_MODES.join('|')})`)
  }
  return mode as FpProjectionsMode
}

const log = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

// Draft-day resilience: log and keep serving rather than crash on a stray rejection.
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT: ${error.stack ?? error.message}`)
})
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`)
})

const main = async (): Promise<void> => {
  const season = Number(process.env.FOOTBALL_SEASON ?? '2026')
  const dbFile = process.env.FOOTBALL_DB ?? path.join(packageDir, '..', 'data', '.data', 'football.db')
  const myTeamId = Number(process.env.FOOTBALL_TEAM_ID ?? '13')
  const port = Number(process.env.PORT ?? '8020')
  const overridesFile = process.env.FOOTBALL_OVERRIDES ?? path.join(packageDir, '..', 'overrides.json')
  const roomRulesFile = process.env.FOOTBALL_ROOM_RULES ?? path.join(packageDir, '..', 'design', 'room-rules.json')
  const creds = espnCreds()

  const app = new App({
    dbFile,
    season,
    myTeamId,
    espnCreds: creds,
    fpApiKey: process.env.FP_API_KEY ?? null,
    fpProjectionsMode: fpProjectionsMode(),
    overridesFile,
    roomRulesFile,
    log,
  })
  const poller = new DraftPoller({
    fetchDetail: async () => {
      if (creds === null) {
        throw new Error('ESPN credentials missing (set ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID) — use manual marks')
      }
      return await fetchEspnDraftDetail(season, creds)
    },
    apply: (detail) => {
      app.applyDraftDetail(detail)
    },
    canPoll: () => !app.ingest.running,
    log,
  })

  await startServer({ app, poller, log }, port)
  log(`db: ${dbFile}`)
  log(
    `league: ${app.settings.name} (${String(app.settings.size)} teams) — my team ${String(myTeamId)}, slot ${String(app.mySlot)}`,
  )
  log(`espn creds: ${creds === null ? 'MISSING — polling unavailable, manual marks only' : 'present'}`)
  const overrides = app.overridesInfo
  log(
    overrides.error !== null ? `overrides: FAILED — ${overrides.error}`
    : overrides.count > 0 ?
      `overrides: ${String(overrides.boosted)} boosted, ${String(overrides.banned)} banned (${overridesFile})`
    : 'overrides: none',
  )
  const profiles = app.roomProfiles
  log(
    profiles === null ?
      `room profiles: none (base room model) — expected ${roomRulesFile}`
    : `room profiles: ${String(profiles.teams.size)} teams from ${roomRulesFile}`,
  )
  log(`board: http://127.0.0.1:${String(port)}/`)
}

main().catch((error: unknown) => {
  console.error('SERVER FAILED TO START:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
