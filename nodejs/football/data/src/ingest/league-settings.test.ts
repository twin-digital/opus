import { describe, expect, it } from 'vitest'

import type { EspnSettingsResponse } from '../fetchers/espn.js'
import { UnknownReferenceValueError } from '../reference/errors.js'
import { mapLeagueSettings } from './league-settings.js'

// Mirrors the live mSettings shape: zero counts on unused slot ids, half-PPR scoring items.
const settingsResponse = (): EspnSettingsResponse => ({
  id: 1838733150,
  settings: {
    name: 'Fixture League',
    size: 12,
    scoringSettings: {
      scoringItems: [
        { statId: 53, points: 0.5 },
        { statId: 20, points: -1 },
        { statId: 3, points: 0.04 },
        { statId: 25, points: 6 },
        { statId: 198, points: 5 }, // exotic (FG 50-59) — kept as raw espnStatId
      ],
    },
    rosterSettings: {
      lineupSlotCounts: {
        '0': 1,
        '1': 0,
        '2': 2,
        '4': 2,
        '6': 1,
        '7': 0,
        '16': 1,
        '17': 1,
        '20': 5,
        '21': 1,
        '23': 1,
      },
    },
    draftSettings: {
      type: 'SNAKE',
      date: 1787947200000,
      pickOrder: [8, 1, 9, 11, 7, 4, 10, 12, 3, 5, 13, 14],
    },
  },
})

describe('mapLeagueSettings', () => {
  it('maps scoring items to canonical StatKeys, keeping exotic ids raw', () => {
    const settings = mapLeagueSettings(settingsResponse())
    expect(settings.scoringRules).toContainEqual({ stat: 'rec', points: 0.5 })
    expect(settings.scoringRules).toContainEqual({ stat: 'passInt', points: -1 })
    expect(settings.scoringRules).toContainEqual({ stat: { espnStatId: 198 }, points: 5 })
  })

  it('maps lineup slot counts through the numeric id table', () => {
    const settings = mapLeagueSettings(settingsResponse())
    expect(settings.lineupSlots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      DST: 1,
      K: 1,
      BENCH: 5,
      IR: 1,
    })
  })

  it('asserts the league uses no unsupported slots', () => {
    const response = settingsResponse()
    response.settings.rosterSettings.lineupSlotCounts['7'] = 1 // superflex
    expect(() => mapLeagueSettings(response)).toThrow(UnknownReferenceValueError)
  })

  it('maps draft settings, converting the date to ISO', () => {
    const settings = mapLeagueSettings(settingsResponse())
    expect(settings.leagueId).toBe('1838733150')
    expect(settings.size).toBe(12)
    expect(settings.draft.type).toBe('snake')
    expect(settings.draft.date).toBe(new Date(1787947200000).toISOString())
    expect(settings.draft.pickOrder).toEqual([8, 1, 9, 11, 7, 4, 10, 12, 3, 5, 13, 14])
  })

  it('rejects non-snake draft types', () => {
    const response = settingsResponse()
    response.settings.draftSettings = { type: 'AUCTION', pickOrder: [] }
    expect(() => mapLeagueSettings(response)).toThrow(/draft type/)
  })
})
