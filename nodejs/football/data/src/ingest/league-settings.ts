import type { EspnSettingsResponse } from '../fetchers/espn.js'
import type { LeagueSettings, ScoringRule } from '../models.js'
import { LINEUP_SLOTS, lineupSlotFromEspn, type LineupSlot } from '../reference/lineup-slot.js'
import { ESPN_STAT_IDS } from '../reference/stat-key.js'

/**
 * mSettings → LeagueSettings. Scoring items with a mapped statId become canonical rules; exotic
 * ones (yardage bonuses, K/DST items) keep their raw ESPN statId. Lineup slot ids outside the
 * supported set with a nonzero count fail loudly per the LineupSlot reference table.
 */
export const mapLeagueSettings = (response: EspnSettingsResponse): LeagueSettings => {
  const { settings } = response

  const scoringRules: ScoringRule[] = settings.scoringSettings.scoringItems.map((item) => {
    const statKey = ESPN_STAT_IDS.get(item.statId)
    return { stat: statKey ?? { espnStatId: item.statId }, points: item.points }
  })

  const lineupSlots = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, 0])) as Record<LineupSlot, number>
  for (const [rawSlotId, count] of Object.entries(settings.rosterSettings.lineupSlotCounts)) {
    if (count === 0) {
      continue
    }
    const slot = lineupSlotFromEspn(Number(rawSlotId)) // throws on unsupported slot ids
    lineupSlots[slot] = count
  }

  const draftSettings = settings.draftSettings
  const draftType = draftSettings?.type?.toLowerCase() ?? 'snake'
  if (draftType !== 'snake') {
    throw new Error(`Unsupported draft type from ESPN mSettings: ${JSON.stringify(draftSettings?.type)}`)
  }

  return {
    leagueId: String(response.id),
    name: settings.name,
    size: settings.size,
    scoringRules,
    lineupSlots,
    draft: {
      type: 'snake',
      date: draftSettings?.date !== undefined ? new Date(draftSettings.date).toISOString() : null,
      pickOrder: draftSettings?.pickOrder ?? [],
    },
  }
}
