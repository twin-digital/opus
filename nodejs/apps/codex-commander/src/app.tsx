import React, { useState } from 'react'
import { Text, useApp, useInput } from 'ink'
import { GameModes } from '@twin-digital/codex'

interface Props {
  name: string | undefined
}

export default function App({ name: _name = 'Stranger' }: Props) {
  const { exit } = useApp()
  const [modeIndex, setModeIndex] = useState(0)

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

  return <Text>MODE: {GameModes[modeIndex]}</Text>
}
