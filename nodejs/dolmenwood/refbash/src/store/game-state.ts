import { Campaign } from '@twin-digital/dolmenwood/session/campaign'
import type { DungeonCrawl } from '@twin-digital/dolmenwood/session/dungeon-crawl'
import { FilePersistentStore } from './file-persistent-store.js'

/**
 * Represents the global game state.
 * This state persists across mode changes to maintain continuity.
 */
export interface GameState {
  /**
   * Overall state of the campaign
   */
  campaign: Campaign

  /**
   * State of the current dungeon crawl
   */
  dungeon: DungeonCrawl

  /**
   * Array of recent event log messages
   */
  eventLog: string[]

  /**
   * The current game mode (e.g., "Dungeon", "Travel", "Combat")
   */
  modeName: string
}

export class CampaignStore extends FilePersistentStore<typeof Campaign> {
  public constructor() {
    super(Campaign, 'campaigns')
  }
}

export const campaignStore = new CampaignStore()
