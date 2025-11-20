import React, { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { GameModes } from '@twin-digital/codex'
import { DungeonScreen } from './dungeon/dungeon-screen.js'

interface Props {
  name: string | undefined
}

export default function App({ name: _name = 'Stranger' }: Props) {
  const { exit } = useApp()
  const [modeIndex, setModeIndex] = useState(2)

  const gameMode = GameModes[modeIndex]

  const incrementModeIndex = () => {
    setModeIndex((i) => (i + 1) % GameModes.length)
  }

  useInput((input, _key) => {
    if (input === 'q') {
      exit()
      return
    }

    if (input === 'm') {
      incrementModeIndex()
    }
  })

  return (
    <Box borderStyle='single' flexDirection='column' flexGrow={1}>
      <Box
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        borderStyle='single'
        borderTop={false}
        paddingLeft={1}
        paddingRight={1}
      >
        {gameMode.name === 'Dungeon' ?
          <DungeonScreen />
        : <>
            <Box flexDirection='row' flexGrow={1}>
              <Text>Mode: {gameMode.name}</Text>
            </Box>
          </>
        }
      </Box>
    </Box>
  )
}
