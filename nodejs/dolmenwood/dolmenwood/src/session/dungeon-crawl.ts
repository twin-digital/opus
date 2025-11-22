import type { GameDateTime } from '../date-time/model.js'
import type { Campaign } from './campaign.js'

/**
 * Core model representing a single dungeon crawl.
 */
export interface DungeonCrawl {
  /**
   * Name of the dungeon site (i.e., the entire location)
   */
  siteName: string

  /**
   * Date and time at which this dungeon crawl began.
   */
  startTime: GameDateTime
}

export const makeDungeonCrawl = (siteName: string, campaign: Campaign): DungeonCrawl => ({
  siteName,
  startTime: campaign.currentDateTime,
})
