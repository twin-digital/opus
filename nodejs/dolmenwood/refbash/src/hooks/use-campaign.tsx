import { Campaign } from '@twin-digital/dolmenwood'
import { useState } from 'react'
import { useStore } from '../store/store-context.js'

/**
 * Represents a keyboard command available in the current mode.
 * Commands are displayed in the footer and handled by mode screens.
 */
export interface Command {
  /**
   * Human-readable description of what the command does (e.g., "next turn")
   */
  description: string

  /**
   * Single character key that triggers the command (e.g., "t", "w")
   */
  key: string
}

/**
 * Internal context value containing all game state and updater functions.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GameContextValue {
  /**
   * Array of currently active commands for the footer
   */
  commands: Command[]

  /**
   * Function to replace all active commands
   */
  setCommands: (commands: Command[]) => void
}

/**
 * Hook to access the campaign state.
 * Returns the complete Campaign.
 *
 * @returns Current campaign state
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const { locationName, hour, turn } = useCampaign()
 * ```
 */
export const useCampaign = (): Campaign => {
  const store = useStore()

  // Get or create the campaign only once
  const [campaign] = useState(() => {
    const campaigns = store.campaigns.list()
    return campaigns.length > 0 ? campaigns[0] : store.campaigns.create()
  })

  return campaign
}
