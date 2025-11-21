import React, { useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { useGameState, useAdvanceTurn, useSetCommands } from '../shared/game-context.js'
import { LogPanel } from '../shared/log-panel.js'

interface DungeonProps {
  /**
   * Number of terminal rows available to this component.
   */
  rows: number

  /**
   * Initial turn number to start on.
   */
  initialTurn?: number
}

/**
 * Determines the display character for a turn status indicator.
 * @param currentTurn - The active turn number (1-6)
 * @param index - The turn index being rendered (1-6)
 * @returns Display character: '*' for current, 'X' for past, 'r' for turn 6, ' ' for future
 */
const getText = (currentTurn: number, index: number) => {
  if (index === currentTurn) {
    return '*'
  }

  if (index < currentTurn) {
    return 'X'
  }

  return index === 6 ? 'r' : ' '
}

/**
 * Renders a single turn status indicator with appropriate styling.
 * Even-indexed turns have red background, current turn has green background.
 * @param currentTurn - The active turn number
 * @param index - The turn index for this indicator
 */
const TurnStatus = ({ currentTurn, index }: { currentTurn: number; index: number }) => {
  return (
    <>
      <Text>[</Text>
      <Text
        backgroundColor={
          index % 2 === 0 ? 'red'
          : currentTurn === index ?
            'greenBright'
          : undefined
        }
      >
        {getText(currentTurn, index)}
      </Text>
      <Text>] </Text>
    </>
  )
}

/**
 * Displays a visual counter showing all 6 turns with status indicators.
 * Past turns show 'X', current turn shows '*', future turns are blank,
 * and turn 6 shows 'r' (for wandering monster check).
 * @param turn - The current turn number (1-6), defaults to 1
 */
const DungeonTurnCounter = ({ turn = 1 }: { turn?: number }) => {
  return (
    <Box>
      <TurnStatus index={1} currentTurn={turn} />
      <TurnStatus index={2} currentTurn={turn} />
      <TurnStatus index={3} currentTurn={turn} />
      <TurnStatus index={4} currentTurn={turn} />
      <TurnStatus index={5} currentTurn={turn} />
      <TurnStatus index={6} currentTurn={turn} />
    </Box>
  )
}

/**
 * Dungeon mode screen component.
 * Displays a turn counter and handles turn advancement.
 * Automatically updates header state and registers dungeon-specific commands.
 *
 * @param props - Component props
 * @param props.initialTurn - Optional starting turn number (1-6), defaults to 1
 *
 * @example
 * ```tsx
 * <DungeonScreen initialTurn={3} />
 * ```
 */
export const DungeonScreen = ({ rows }: DungeonProps) => {
  const gameState = useGameState()
  const { turn, eventLog } = gameState
  const advanceTurn = useAdvanceTurn()
  const setCommands = useSetCommands()

  // Set commands on mount
  useEffect(() => {
    setCommands([
      { key: 't/T', description: 'turn +1/-1' },
      { key: 'w', description: 'check wandering monsters' },
      { key: 'm', description: 'change mode' },
    ])
  }, [setCommands])

  useInput((input, _key) => {
    if (input === 't') {
      advanceTurn(1)
    }
    if (input === 'T') {
      advanceTurn(-1)
    }
  })

  return (
    <Box flexDirection='row' width='100%' height='100%'>
      {/* Left column (2/5) - blank for now */}
      <Box
        width='40%'
        height='100%'
        paddingRight={1}
        borderDimColor
        borderRight={true}
        borderStyle='single'
        borderLeft={false}
        borderTop={false}
        borderBottom={false}
        flexDirection='column'
      >
        <Text dimColor>Left panel</Text>
      </Box>

      {/* Middle column (2/5) - turn track */}
      <Box
        width='40%'
        height='100%'
        paddingX={1}
        borderRight={true}
        borderDimColor
        borderStyle='single'
        borderLeft={false}
        borderTop={false}
        borderBottom={false}
        flexDirection='column'
      >
        <Text>Turn: </Text>
        <DungeonTurnCounter turn={turn} />
      </Box>

      {/* Right column (1/5) - event log */}
      <LogPanel
        backgroundColor='black'
        entries={eventLog}
        flexDirection='column'
        height={rows}
        overflow='hidden'
        paddingLeft={1}
        width='20%'
      />
    </Box>
  )
}
