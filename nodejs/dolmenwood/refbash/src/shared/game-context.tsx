import { Campaign } from '@twin-digital/dolmenwood/session/campaign'
import React, { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

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

const CamapaignContext = createContext<Campaign | undefined>(undefined)

/**
 * Props for the GameProvider component.
 */
interface GameProviderProps {
  /**
   * Child components to wrap with game context
   */
  children: ReactNode

  /**
   * Campaign which is being managed by this app.
   */
  campaign: Campaign
}

/**
 * Provider component that manages global game state via React Context.
 * Wrap your app with this component to enable access to game state hooks.
 *
 * @example
 * ```tsx
 * <GameProvider
 *   initialLocationName="The Fogbound Forest"
 *   initialHour={14}
 * >
 *   <App />
 * </GameProvider>
 * ```
 */
export const CampaignProvider = ({ campaign, children }: GameProviderProps) => {
  return <CamapaignContext.Provider value={campaign}>{children}</CamapaignContext.Provider>
}

/**
 * Hook to access the campaign state.
 * Returns the complete Campaign.
 *
 * @returns Current camapign state
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const { locationName, hour, turn } = useCampaign()
 * ```
 */
export const useCampaign = (): Campaign => {
  const context = useContext(CamapaignContext)
  if (!context) {
    throw new Error('useCampaign must be used within a CampaignProvider')
  }
  return context
}
