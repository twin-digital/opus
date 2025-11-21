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
   * Array of recent event log messages
   */
  eventLog: string[]

  /**
   * Hour of the day in 24-hour format (0-23)
   */
  hour: number

  /**
   * Initial hour when turn tracking started (0-23)
   */
  initialHour: number

  /**
   * Initial minutes when turn tracking started (0-59)
   */
  initialMinutes: number

  /**
   * The current location name (e.g., "The Fogbound Forest")
   */
  locationName: string

  /**
   * Minutes past the hour (0-59)
   */
  minutes: number

  /**
   * The current game mode (e.g., "Dungeon", "Travel", "Combat")
   */
  modeName: string

  /**
   * Ever-increasing turn counter (not bounded to 1-6)
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
   * Semantic function to add an event to the log
   */
  addEvent: (message: string) => void

  /**
   * Semantic function to advance the turn counter
   */
  advanceTurn: (delta?: number) => void

  /**
   * Semantic function to change the current location
   */
  changeLocation: (locationName: string) => void

  /**
   * Semantic function to clear the event log
   */
  clearEventLog: () => void

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
   * Initial minutes past the hour, 0-59 (defaults to 0)
   */
  initialMinutes?: number

  /**
   * Initial mode name (defaults to "Unknown Mode")
   */
  initialModeName?: string
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
export const GameProvider = ({
  children,
  initialLocationName = 'Unknown Location',
  initialModeName = 'Unknown Mode',
  initialDate = 'Unknown Date',
  initialHour = 0,
  initialMinutes = 0,
}: GameProviderProps) => {
  const [gameState, setGameState] = useState<GameState>({
    locationName: initialLocationName,
    modeName: initialModeName,
    date: initialDate,
    hour: initialHour,
    initialHour: initialHour,
    minutes: initialMinutes,
    initialMinutes: initialMinutes,
    turn: 1,
    eventLog: [],
  })

  const [commands, setCommands] = useState<Command[]>([])

  const updateGameState = useCallback((updates: Partial<GameState>) => {
    setGameState((prev) => ({ ...prev, ...updates }))
  }, [])

  const addEvent = useCallback((message: string) => {
    setGameState((prev) => ({
      ...prev,
      eventLog: [...prev.eventLog, message],
    }))
  }, [])

  const clearEventLog = useCallback(() => {
    setGameState((prev) => ({ ...prev, eventLog: [] }))
  }, [])

  const advanceTurn = useCallback((delta = 1) => {
    setGameState((prev) => {
      const newTurn = prev.turn + delta

      // Don't allow turn to go below 1
      if (newTurn < 1) {
        return prev
      }

      // Calculate new time based on initial time + ((turn - 1) * 10 minutes)
      // Turn 1 = initial time, turn 2 = +10 min, turn 3 = +20 min, etc.
      const totalMinutesElapsed = (newTurn - 1) * 10
      const totalMinutesFromMidnight = prev.initialHour * 60 + prev.initialMinutes + totalMinutesElapsed
      const newHour = Math.floor(totalMinutesFromMidnight / 60) % 24
      const newMinutes = totalMinutesFromMidnight % 60

      // Add event log entry with proper sign formatting
      const sign = delta >= 0 ? '+' : ''
      const eventMessage = `Turn ${sign}${delta} (${newTurn})`

      return {
        ...prev,
        turn: newTurn,
        hour: newHour,
        minutes: newMinutes,
        eventLog: [...prev.eventLog, eventMessage],
      }
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
    addEvent,
    clearEventLog,
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
 * Hook to advance the turn counter.
 * The turn is an ever-increasing counter. Time is calculated as initialTime + (turn * 10 minutes).
 * Automatically logs an event when the turn advances.
 *
 * @returns Function that advances the turn by a given delta (defaults to 1)
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const advanceTurn = useAdvanceTurn()
 * advanceTurn() // Advances turn by 1
 * advanceTurn(3) // Advances turn by 3
 * ```
 */
export const useAdvanceTurn = (): ((delta?: number) => void) => {
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

/**
 * Hook to add an event message to the event log.
 * Events are appended to the end of the log array.
 *
 * @returns Function that accepts an event message string
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const addEvent = useAddEvent()
 * addEvent('Party encounters a wandering monster')
 * addEvent('Found a secret door')
 * ```
 */
export const useAddEvent = (): ((message: string) => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useAddEvent must be used within a GameProvider')
  }
  return context.addEvent
}

/**
 * Hook to clear all events from the event log.
 * Resets the event log to an empty array.
 *
 * @returns Function that clears the event log
 * @throws Error if used outside of GameProvider
 *
 * @example
 * ```tsx
 * const clearEventLog = useClearEventLog()
 * clearEventLog() // Removes all events from the log
 * ```
 */
export const useClearEventLog = (): (() => void) => {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useClearEventLog must be used within a GameProvider')
  }
  return context.clearEventLog
}
