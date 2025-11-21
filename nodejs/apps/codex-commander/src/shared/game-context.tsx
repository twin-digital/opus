import React, { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

/**
 * Represents the global game state.
 * This state persists across mode changes to maintain continuity.
 */
export interface GameState {
  /**
   * The in-game date string (e.g., "3rd of Coldwane")
   */
  date: string

  /**
   * Hour of the day in 24-hour format (0-23)
   */
  hour: number

  /**
   * The current location name (e.g., "The Fogbound Forest")
   */
  locationName: string

  /**
   * The current game mode (e.g., "Dungeon", "Travel", "Combat")
   */
  modeName: string

  /**
   * Turn number within the hour (1-6), representing 10-minute increments
   */
  turn: number
}

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
interface GameContextValue {
  /**
   * Semantic function to advance to the next turn
   */
  advanceTurn: () => void

  /**
   * Semantic function to change the current location
   */
  changeLocation: (locationName: string) => void

  /**
   * Array of currently active commands for the footer
   */
  commands: Command[]

  /**
   * Current game state values
   */
  gameState: GameState

  /**
   * Function to replace all active commands
   */
  setCommands: (commands: Command[]) => void

  /**
   * Function to partially update game state
   */
  updateGameState: (updates: Partial<GameState>) => void
}

const GameContext = createContext<GameContextValue | undefined>(undefined)

/**
 * Props for the GameProvider component.
 */
interface GameProviderProps {
  /**
   * Child components to wrap with game context
   */
  children: ReactNode

  /**
   * Initial date string (defaults to "Unknown Date")
   */
  initialDate?: string

  /**
   * Initial hour of day, 0-23 (defaults to 0)
   */
  initialHour?: number

  /**
   * Initial location name (defaults to "Unknown Location")
   */
  initialLocationName?: string

  /**
   * Initial mode name (defaults to "Unknown Mode")
   */
  initialModeName?: string

  /**
   * Initial turn number, 1-6 (defaults to 1)
   */
  initialTurn?: number
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
 *   initialTurn={3}
 * >
 *   <App />
 * </GameProvider>
 * ```
 */
export const GameProvider = ({
  children,
  initialLocationName = 'Unknown Location',
  initialModeName = 'Unknown Mode',
  initialDate = 'Unknown Date',
  initialHour = 0,
  initialTurn = 1,
}: GameProviderProps) => {
  const [gameState, setGameState] = useState<GameState>({
    locationName: initialLocationName,
    modeName: initialModeName,
    date: initialDate,
    hour: initialHour,
    turn: initialTurn,
  })

  const [commands, setCommands] = useState<Command[]>([])

  const updateGameState = useCallback((updates: Partial<GameState>) => {
    setGameState((prev) => ({ ...prev, ...updates }))
  }, [])

  const advanceTurn = useCallback(() => {
    setGameState((prev) => {
      const newTurn = prev.turn + 1
      if (newTurn > 6) {
        // Roll over to next hour
        const newHour = (prev.hour + 1) % 24
        return { ...prev, hour: newHour, turn: 1 }
      }
      return { ...prev, turn: newTurn }
    })
  }, [])

  const changeLocation = useCallback((locationName: string) => {
    setGameState((prev) => ({ ...prev, locationName }))
  }, [])

  const value: GameContextValue = {
    gameState,
    updateGameState,
    commands,
    setCommands,
    advanceTurn,
    changeLocation,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

/**
 * Hook to access the current game state.
 * Returns the complete GameState object containing location, mode, date, and time.
 *
 * @returns Current game state
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const { locationName, hour, turn } = useGameState()
 * ```
 */
export const useGameState = (): GameState => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGameState must be used within a GameProvider')
  }
  return context.gameState
}

/**
 * Hook to get a function for updating game state.
 * Accepts partial updates to merge with existing state.
 * For common operations, consider using semantic helpers like useAdvanceTurn.
 *
 * @returns Function that accepts partial GameState updates
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const updateGameState = useUpdateGameState()
 * updateGameState({ turn: 3 }) // Only updates turn, preserves other fields
 * updateGameState({ locationName: "New Cave", hour: 15 })
 * ```
 */
export const useUpdateGameState = (): ((updates: Partial<GameState>) => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useUpdateGameState must be used within a GameProvider')
  }
  return context.updateGameState
}

/**
 * Hook to access the current list of active commands.
 * These commands are displayed in the footer.
 *
 * @returns Array of currently active commands
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const commands = useCommands()
 * // [{ key: 't', description: 'next turn' }, ...]
 * ```
 */
export const useCommands = (): Command[] => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useCommands must be used within a GameProvider')
  }
  return context.commands
}

/**
 * Hook to get a function for replacing all active commands.
 * Mode screens should call this in a useEffect to register their commands.
 *
 * @returns Function that accepts an array of Command objects
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const setCommands = useSetCommands()
 * useEffect(() => {
 *   setCommands([
 *     { key: 't', description: 'next turn' },
 *     { key: 'w', description: 'check wandering monsters' }
 *   ])
 * }, [setCommands])
 * ```
 */
export const useSetCommands = (): ((commands: Command[]) => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useSetCommands must be used within a GameProvider')
  }
  return context.setCommands
}

/**
 * Hook to advance to the next turn.
 * Automatically handles turn rollover - when advancing past turn 6,
 * it resets to turn 1 and advances the hour.
 *
 * @returns Function that advances the turn
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const advanceTurn = useAdvanceTurn()
 * advanceTurn() // Advances from turn 3 to turn 4
 * advanceTurn() // If on turn 6, advances to turn 1 and increments hour
 * ```
 */
export const useAdvanceTurn = (): (() => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useAdvanceTurn must be used within a GameProvider')
  }
  return context.advanceTurn
}

/**
 * Hook to change the current location.
 * Updates the location name in game state.
 *
 * @returns Function that accepts a location name string
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const changeLocation = useChangeLocation()
 * changeLocation('The Dark Tower')
 * changeLocation('Fogbound Forest - Level 2')
 * ```
 */
export const useChangeLocation = (): ((locationName: string) => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useChangeLocation must be used within a GameProvider')
  }
  return context.changeLocation
}
