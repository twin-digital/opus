import type { Store } from '../db/store.js'
import type { NewsAssessment, Player, PlayerNewsItem } from '../models.js'
import { selectNewsworthyPool } from './scope.js'

export interface NewsReport {
  /** Items assessed harms at med or high impact, grouped by player, worst first. */
  harms: { player: Player; entries: { item: PlayerNewsItem; assessment: NewsAssessment }[] }[]
  /** Newsworthy-pool players flagged injured with no assessed item — still need eyes. */
  unassessedInjured: { player: Player; itemCount: number }[]
}

export const buildNewsReport = (store: Store): NewsReport => {
  const players = store.getPlayers()
  const byId = new Map(players.map((player) => [player.id, player]))
  const pool = selectNewsworthyPool(players, store.getMarketData())

  const assessedByPlayer = new Map<Player['id'], { item: PlayerNewsItem; assessment: NewsAssessment }[]>()
  const playersWithAssessment = new Set<Player['id']>()
  const itemCounts = new Map<Player['id'], number>()
  for (const item of store.getNewsItems()) {
    itemCounts.set(item.playerId, (itemCounts.get(item.playerId) ?? 0) + 1)
  }
  for (const player of pool) {
    for (const { item, assessment } of store.getNewsForPlayer(player.id)) {
      if (!assessment) {
        continue
      }
      playersWithAssessment.add(player.id)
      if (assessment.direction === 'harms' && assessment.impact !== 'low') {
        let entries = assessedByPlayer.get(player.id)
        if (!entries) {
          entries = []
          assessedByPlayer.set(player.id, entries)
        }
        entries.push({ item, assessment })
      }
    }
  }

  const harms = [...assessedByPlayer.entries()]
    .map(([playerId, entries]) => ({ player: byId.get(playerId), entries }))
    .filter((group): group is NewsReport['harms'][number] => group.player !== undefined)
    .sort(
      (a, b) =>
        Number(b.entries.some((e) => e.assessment.impact === 'high')) -
        Number(a.entries.some((e) => e.assessment.impact === 'high')),
    )

  const unassessedInjured = pool
    .filter((player) => player.injuryStatus !== 'ACTIVE' && !playersWithAssessment.has(player.id))
    .map((player) => ({ player, itemCount: itemCounts.get(player.id) ?? 0 }))

  return { harms, unassessedInjured }
}
