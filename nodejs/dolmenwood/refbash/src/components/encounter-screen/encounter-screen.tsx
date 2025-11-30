import React from 'react'
import { Box, Text } from 'ink'

/**
 * Encounter mode screen component.
 * Displays encounter interface and registers encounter-specific commands
 * (reaction roll, enter combat, change mode).
 *
 * @example
 * ```tsx
 * <EncounterScreen />
 * ```
 */
export const EncounterScreen = () => {
  // const setCommands = useSetCommands()

  // useEffect(() => {
  //   setCommands([
  //     { key: 'r', description: 'reaction roll' },
  //     { key: 'c', description: 'enter combat' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  return (
    <Box flexDirection='column'>
      <Text>An encounter occurs...</Text>
    </Box>
  )
}
