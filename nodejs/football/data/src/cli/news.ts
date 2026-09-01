import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { openDatabase } from '../db/connection.js'
import { Store } from '../db/store.js'
import { parseAssessmentFile } from '../news/assess-file.js'
import { runNewsFetch } from '../news/fetch.js'
import { buildNewsReport } from '../news/report.js'

const packageDir = path.resolve(fileURLToPath(import.meta.url), '../../..')

const USAGE = `Usage: pnpm news <subcommand>

Subcommands:
  fetch                 fetch news for the newsworthy pool into player_news
  assess --file <json>  bulk-load assessments: JSON array of {newsId, direction, impact, summary}
                        (--by <name> stamps assessedBy; default "agent")
  report                players with harms med/high assessments + injury-flagged players without one

FOOTBALL_DB overrides the store path (default .data/football.db).`

const openStore = (): Store => {
  const dbFile = process.env.FOOTBALL_DB ?? path.join(packageDir, '.data', 'football.db')
  return new Store(openDatabase(dbFile))
}

const fetchCommand = async (): Promise<void> => {
  const store = openStore()
  const summary = await runNewsFetch(store, (message) => {
    console.log(message)
  })
  console.log('\n=== News fetch summary ===')
  console.log(`pool: ${summary.poolSize} players`)
  for (const [source, counts] of Object.entries(summary.bySource)) {
    console.log(`  ${source}: ${counts.inserted} new, ${counts.updated} existing (refreshed)`)
  }
  console.log(`stored total: ${formatCounts(store.countNewsBySource())}`)
  if (summary.failures.length > 0) {
    console.log(`\nFailed fetches (${summary.failures.length}):`)
    for (const failure of summary.failures) {
      console.log(`  ${failure.name}: ${failure.error}`)
    }
  }
}

const assessCommand = (args: string[]): void => {
  const { values } = parseArgs({ args, options: { file: { type: 'string' }, by: { type: 'string' } } })
  if (values.file === undefined) {
    throw new Error('assess requires --file <json>')
  }
  const payload: unknown = JSON.parse(readFileSync(values.file, 'utf8'))
  const store = openStore()
  const knownIds = new Set(store.getNewsItems().map((item) => item.id))
  const { assessments, errors } = parseAssessmentFile(payload, knownIds)
  if (errors.length > 0) {
    console.error(`Rejected: ${errors.length} invalid entries, nothing loaded.`)
    for (const error of errors) {
      console.error(`  ${error}`)
    }
    process.exitCode = 1
    return
  }
  const assessedAt = new Date().toISOString()
  const assessedBy = values.by ?? 'agent'
  for (const assessment of assessments) {
    store.upsertAssessment({ ...assessment, assessedAt, assessedBy })
  }
  console.log(`Loaded ${assessments.length} assessments (${store.countAssessments()} total stored).`)
}

const reportCommand = (): void => {
  const store = openStore()
  const report = buildNewsReport(store)
  console.log(`=== Harms (med/high) — ${report.harms.length} players ===`)
  for (const { player, entries } of report.harms) {
    console.log(`\n${player.name} (${player.team ?? 'FA'} ${player.position}, status ${player.injuryStatus})`)
    for (const { item, assessment } of entries) {
      console.log(`  [${assessment.impact}] ${item.headline}`)
      console.log(`        ${assessment.summary}`)
    }
  }
  console.log(`\n=== Injury-flagged, no assessment — ${report.unassessedInjured.length} players ===`)
  for (const { player, itemCount } of report.unassessedInjured) {
    console.log(
      `  ${player.name} (${player.team ?? 'FA'} ${player.position}) ${player.injuryStatus} — ${itemCount} stored items`,
    )
  }
}

const main = async (): Promise<void> => {
  const [subcommand, ...rest] = process.argv.slice(2)
  switch (subcommand) {
    case 'fetch':
      await fetchCommand()
      break
    case 'assess':
      assessCommand(rest)
      break
    case 'report':
      reportCommand()
      break
    default:
      console.log(USAGE)
      process.exitCode = subcommand === undefined || subcommand === 'help' ? 0 : 1
  }
}

const formatCounts = (counts: Record<string, number>): string =>
  Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')

main().catch((error: unknown) => {
  console.error('\nNEWS COMMAND FAILED:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
