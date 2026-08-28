import { describe, expect, it } from 'vitest'

import { mintPlayerId } from '../ids.js'
import { newsItemFromEspnFeed, type EspnNewsFeedItem } from './espn-news.js'

const rotowireItem: EspnNewsFeedItem = {
  id: 63352828,
  nowId: '23-63352828',
  type: 'Rotowire',
  headline: "Gibbs was held out of Thursday's preseason opener.",
  description: 'Coach called it precautionary.',
  published: '2026-08-14T13:49:41Z',
  story: '<p>Coach called it precautionary; Gibbs is expected back next week.</p>',
}

describe('newsItemFromEspnFeed', () => {
  it('maps a Rotowire item: nowId as externalId, story as body', () => {
    const playerId = mintPlayerId()
    expect(newsItemFromEspnFeed(playerId, rotowireItem)).toEqual({
      playerId,
      source: 'espn-news',
      externalId: '23-63352828',
      published: '2026-08-14T13:49:41Z',
      headline: "Gibbs was held out of Thursday's preseason opener.",
      body: '<p>Coach called it precautionary; Gibbs is expected back next week.</p>',
    })
  })

  it('falls back to the numeric id and description body on Media items', () => {
    const item = newsItemFromEspnFeed(mintPlayerId(), {
      id: 49716521,
      type: 'Media',
      headline: 'Who should be the first pick?',
      description: 'Analysts debate the first pick.',
    })
    expect(item?.externalId).toBe('49716521')
    expect(item?.published).toBeNull()
    expect(item?.body).toBe('Analysts debate the first pick.')
  })

  it('drops the body when the description just repeats the headline, and headline-less items entirely', () => {
    expect(
      newsItemFromEspnFeed(mintPlayerId(), { id: 1, headline: 'Same text.', description: 'Same text.' })?.body,
    ).toBeNull()
    expect(newsItemFromEspnFeed(mintPlayerId(), { id: 2 })).toBeNull()
  })
})
