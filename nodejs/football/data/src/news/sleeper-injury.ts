import { createHash } from 'node:crypto'

import type { SleeperPlayer } from '../fetchers/sleeper.js'
import type { PlayerId } from '../ids.js'
import type { PlayerNewsDraft } from '../models.js'

/**
 * Synthesize a sleeper-injury news item from the players-DB injury fields, or null when the
 * entry carries no injury signal. externalId hashes playerId+news_updated, so a new Sleeper
 * update mints a new item while refetches of the same update upsert in place.
 */
export const synthesizeSleeperInjuryItem = (playerId: PlayerId, entry: SleeperPlayer): PlayerNewsDraft | null => {
  const status = emptyToNull(entry.injury_status)
  const notes = emptyToNull(entry.injury_notes)
  if (status === null && notes === null) {
    return null
  }
  const bodyPart = emptyToNull(entry.injury_body_part)
  const externalId = createHash('sha256')
    .update(`${playerId}:${entry.news_updated ?? ''}`)
    .digest('hex')
    .slice(0, 16)
  return {
    playerId,
    source: 'sleeper-injury',
    externalId,
    published: entry.news_updated != null ? new Date(entry.news_updated).toISOString() : null,
    headline: `Sleeper injury report: ${status ?? 'no status'}${bodyPart === null ? '' : ` (${bodyPart})`}`,
    body: notes,
  }
}

const emptyToNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value === '' ? null : value
