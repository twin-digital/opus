import React from 'react'
import { Box, Text } from 'ink'

/**
 * Camping mode screen component.
 * Displays camping interface and registers camping-specific commands
 * (set watch, rest party, change mode).
 *
 * @example
 * ```tsx
 * <CampingScreen />
 * ```
 */
export const CampingScreen = () => {
  // const setCommands = useSetCommands()

  // useEffect(() => {
  //   setCommands([
  //     { key: 'w', description: 'set watch' },
  //     { key: 'r', description: 'rest party' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  return (
    <Box flexDirection='column'>
      <Text>Making camp for the night...</Text>
    </Box>
  )
}
