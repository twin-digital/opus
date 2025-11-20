import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

interface DungeonProps {
  /**
   * Initial turn number to start on.
   */
  initialTurn?: number
}

const getText = (currentTurn: number, index: number) => {
  if (index === currentTurn) {
    return '*'
  }

  if (index < currentTurn) {
    return 'X'
  }

  return index === 6 ? 'r' : ' '
}

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

export const DungeonScreen = (props: DungeonProps) => {
  const [turn, setTurn] = useState(props.initialTurn ?? 1)

  const nextTurn = () => {
    setTurn((i) => {
      const next = (i + 1) % 7
      return next === 0 ? 1 : next
    })
  }

  useInput((input, _key) => {
    if (input === ' ') {
      nextTurn()
    }
  })

  return (
    <>
      <Box flexDirection='row' flexGrow={1}>
        <Text>DUNGEON</Text>
      </Box>
      <Box flexDirection='row'>
        <DungeonTurnCounter turn={turn} />
      </Box>
    </>
  )
}
