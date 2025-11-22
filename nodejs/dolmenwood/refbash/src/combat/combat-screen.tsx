import React from 'react'
import { Box, Text } from 'ink'

/**
 * Combat mode screen component.
 * Displays combat interface and registers combat-specific commands
 * (initiative, attack, next round, change mode).
 *
 * @example
 * ```tsx
 * <CombatScreen />
 * ```
 */
export const CombatScreen = () => {
  // const setCommands = useSetCommands()

  // useEffect(() => {
  //   setCommands([
  //     { key: 'i', description: 'initiative' },
  //     { key: 'a', description: 'attack' },
  //     { key: 'n', description: 'next round' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  return (
    <Box flexDirection='column'>
      <Text>Combat engaged!</Text>
    </Box>
  )
}
