import { BROWSER_USER_AGENT, fetchText } from './http.js'

// The league is half-PPR, so rankings come from the half-point cheatsheet variant.
const RANKINGS_URL = 'https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php'

export interface EcrPlayer {
  player_id: number
  player_name: string
  player_team_id: string
  player_position_id: string
  player_bye_week?: string | number | null
  rank_ecr: number
  pos_rank: string
  tier: number
  rank_min: string | number
  rank_max: string | number
  rank_std: string | number
  player_owned_avg?: number | null
}

export interface EcrData {
  players: EcrPlayer[]
  last_updated?: string
  scoring?: string
}

export class EcrExtractionError extends Error {
  constructor(detail: string) {
    super(`Failed to extract ecrData from FantasyPros rankings page: ${detail}`)
    this.name = 'EcrExtractionError'
  }
}

/**
 * Pull the `var ecrData = {...};` assignment out of the page. The scrape is fragile by design:
 * anything unexpected throws rather than yielding garbage rows.
 */
export const extractEcrData = (html: string): EcrData => {
  const marker = /var\s+ecrData\s*=\s*/.exec(html)
  if (!marker) {
    throw new EcrExtractionError('no `var ecrData =` assignment found')
  }
  const start = html.indexOf('{', marker.index + marker[0].length)
  if (start < 0) {
    throw new EcrExtractionError('no object literal after assignment')
  }

  // Scan to the matching close brace, honoring string literals.
  let depth = 0
  let inString: '"' | "'" | null = null
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inString !== null) {
      if (ch === '\\') {
        i++
      } else if (ch === inString) {
        inString = null
      }
    } else if (ch === '"' || ch === "'") {
      inString = ch
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const raw = html.slice(start, i + 1)
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch (error) {
          throw new EcrExtractionError(`ecrData is not valid JSON: ${String(error)}`)
        }
        const data = parsed as EcrData
        if (!Array.isArray(data.players) || data.players.length === 0) {
          throw new EcrExtractionError('ecrData has no players[]')
        }
        return data
      }
    }
  }
  throw new EcrExtractionError('unbalanced braces in ecrData object')
}

export const fetchFantasyProsEcr = async (): Promise<EcrData> => {
  const html = await fetchText(RANKINGS_URL, { 'user-agent': BROWSER_USER_AGENT })
  return extractEcrData(html)
}
