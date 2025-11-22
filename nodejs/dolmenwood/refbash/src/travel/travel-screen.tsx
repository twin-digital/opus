import React from 'react'
import { Box, Text } from 'ink'

/**
 * Travel mode screen component.
 * Displays travel-related interface and registers travel-specific commands
 * (check for encounters, rest, change mode).
 *
 * @example
 * ```tsx
 * <TravelScreen />
 * ```
 */
export const TravelScreen = () => {
  // const setCommands = useSetCommands()

  // useEffect(() => {
  //   setCommands([
  //     { key: 'w', description: 'check for encounters' },
  //     { key: 'r', description: 'rest' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  return (
    <Box flexDirection='column'>
      <Text>Traveling through the wilderness...</Text>
    </Box>
  )
}
