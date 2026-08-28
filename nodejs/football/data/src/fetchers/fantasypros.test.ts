import { describe, expect, it } from 'vitest'

import { EcrExtractionError, extractEcrData } from './fantasypros.js'

// Shape mirrors the live half-point-ppr-cheatsheets.php embed.
const ECR_JSON = JSON.stringify({
  sport: 'NFL',
  type: 'Draft Half PPR',
  year: '2026',
  scoring: 'HALF',
  last_updated: '2026-08-26',
  players: [
    {
      player_id: 19788,
      player_name: "Ja'Marr Chase",
      player_team_id: 'CIN',
      player_position_id: 'WR',
      player_bye_week: '10',
      rank_ecr: 1,
      pos_rank: 'WR1',
      tier: 1,
      rank_min: '1',
      rank_max: '3',
      rank_std: '0.7',
      player_owned_avg: 99.7,
    },
  ],
})

const page = (script: string): string =>
  `<html><head></head><body><script>var foo = 1;\n${script}\nvar other = {};</script></body></html>`

describe('extractEcrData', () => {
  it('extracts the ecrData assignment from the page', () => {
    const data = extractEcrData(page(`var ecrData = ${ECR_JSON};`))
    expect(data.players).toHaveLength(1)
    expect(data.players[0]?.pos_rank).toBe('WR1')
    expect(data.last_updated).toBe('2026-08-26')
  })

  it('handles braces inside string values', () => {
    const json = JSON.stringify({ players: [{ player_id: 1, player_name: 'A {weird} name' }], note: 'ends}' })
    const data = extractEcrData(page(`var ecrData = ${json};`))
    expect(data.players).toHaveLength(1)
  })

  it('throws a clear error when the assignment is missing', () => {
    expect(() => extractEcrData('<html>redesigned page</html>')).toThrow(EcrExtractionError)
  })

  it('throws when ecrData has no players (never yields garbage rows)', () => {
    expect(() => extractEcrData(page('var ecrData = {"players": []};'))).toThrow(EcrExtractionError)
  })

  it('throws on truncated/unbalanced JSON', () => {
    expect(() => extractEcrData('var ecrData = {"players": [{')).toThrow(EcrExtractionError)
  })
})
