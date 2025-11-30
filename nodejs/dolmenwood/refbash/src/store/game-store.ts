import { Campaign, Delve } from '@twin-digital/dolmenwood'
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

export class DelveStore extends FilePersistentStore<typeof Delve> {
  public constructor() {
    super(Delve, 'delves')
  }
}

export const createGameStore = () => ({
  campaigns: new CampaignStore(),
  delves: new DelveStore(),
})
