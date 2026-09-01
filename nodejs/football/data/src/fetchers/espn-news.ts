import type { PlayerId } from '../ids.js'
import type { PlayerNewsDraft } from '../models.js'
import { fetchJson } from './http.js'

/** One entry of the fantasy news feed. `story` (Rotowire text/html) is absent on Media items. */
export interface EspnNewsFeedItem {
  id: number
  /** Content-scoped stable id, e.g. '23-63352828'; preferred over `id` (dataSource-prefixed). */
  nowId?: string
  type?: string
  headline?: string
  description?: string
  published?: string
  lastModified?: string
  story?: string
}

interface EspnNewsResponse {
  feed?: EspnNewsFeedItem[]
}

export const fetchEspnPlayerNews = async (espnPlayerId: string, limit = 3): Promise<EspnNewsFeedItem[]> => {
  const url = `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${espnPlayerId}&limit=${limit}`
  const response = await fetchJson<EspnNewsResponse>(url)
  return response.feed ?? []
}

/** Map a feed item to a storable draft; null when it carries no headline to show. */
export const newsItemFromEspnFeed = (playerId: PlayerId, item: EspnNewsFeedItem): PlayerNewsDraft | null => {
  const headline = item.headline ?? item.description
  if (headline === undefined || headline === '') {
    return null
  }
  return {
    playerId,
    source: 'espn-news',
    externalId: item.nowId ?? String(item.id),
    published: item.published ?? item.lastModified ?? null,
    headline,
    body: item.story ?? (item.description !== headline ? (item.description ?? null) : null),
  }
}
