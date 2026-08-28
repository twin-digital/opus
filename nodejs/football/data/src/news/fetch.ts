import { fetchEspnPlayerNews, newsItemFromEspnFeed } from '../fetchers/espn-news.js'
import { fetchSleeperPlayersDb } from '../fetchers/sleeper.js'
import type { Store } from '../db/store.js'
import type { PlayerId } from '../ids.js'
import type { PlayerNewsDraft } from '../models.js'
import { selectNewsworthyPool } from './scope.js'
import { synthesizeSleeperInjuryItem } from './sleeper-injury.js'

const PACING_MS = 100

export interface NewsFetchSummary {
  poolSize: number
  bySource: Record<string, { inserted: number; updated: number }>
  failures: { playerId: PlayerId; name: string; error: string }[]
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Fetch ESPN news for the newsworthy pool and synthesize sleeper-injury items, upserting both. */
export const runNewsFetch = async (store: Store, log: (message: string) => void): Promise<NewsFetchSummary> => {
  const fetchedAt = new Date().toISOString()
  const pool = selectNewsworthyPool(store.getPlayers(), store.getMarketData())
  log(`Newsworthy pool: ${pool.length} players`)

  const externalIds = new Map<string, Map<PlayerId, string>>()
  for (const mapping of store.getMappings()) {
    let bySource = externalIds.get(mapping.source)
    if (!bySource) {
      bySource = new Map()
      externalIds.set(mapping.source, bySource)
    }
    bySource.set(mapping.playerId, mapping.externalId)
  }
  const espnIds = externalIds.get('espn') ?? new Map<PlayerId, string>()
  const sleeperIds = externalIds.get('sleeper') ?? new Map<PlayerId, string>()

  const failures: NewsFetchSummary['failures'] = []
  const espnDrafts: PlayerNewsDraft[] = []
  let unmapped = 0
  log('Fetching ESPN player news...')
  for (const player of pool) {
    const espnId = espnIds.get(player.id)
    if (espnId === undefined) {
      unmapped += 1
      continue
    }
    try {
      const feed = await fetchEspnPlayerNews(espnId)
      for (const item of feed) {
        const draft = newsItemFromEspnFeed(player.id, item)
        if (draft) {
          espnDrafts.push(draft)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ playerId: player.id, name: player.name, error: message })
      log(`  WARNING: news fetch failed for ${player.name}: ${message}`)
    }
    await sleep(PACING_MS)
  }
  if (unmapped > 0) {
    log(`  ${unmapped} pool players have no ESPN id mapping — skipped`)
  }
  const espnResult = store.upsertNewsItems(espnDrafts, fetchedAt)

  log('Fetching Sleeper players DB for injury items...')
  const sleeperPlayers = await fetchSleeperPlayersDb()
  const sleeperDrafts: PlayerNewsDraft[] = []
  for (const player of pool) {
    const sleeperId = sleeperIds.get(player.id)
    const entry = sleeperId === undefined ? undefined : sleeperPlayers[sleeperId]
    if (!entry) {
      continue
    }
    const draft = synthesizeSleeperInjuryItem(player.id, entry)
    if (draft) {
      sleeperDrafts.push(draft)
    }
  }
  const sleeperResult = store.upsertNewsItems(sleeperDrafts, fetchedAt)

  return {
    poolSize: pool.length,
    bySource: { 'espn-news': espnResult, 'sleeper-injury': sleeperResult },
    failures,
  }
}
