import React from 'react'
import { Box, Text } from 'ink'

/**
 * Settlement mode screen component.
 * Displays settlement interface and registers settlement-specific commands
 * (visit shops, visit tavern, change mode).
 *
 * @example
 * ```tsx
 * <SettlementScreen />
 * ```
 */
export const SettlementScreen = () => {
  // const setCommands = useSetCommands()

  // useEffect(() => {
  //   setCommands([
  //     { key: 's', description: 'visit shops' },
  //     { key: 't', description: 'visit tavern' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  return (
    <Box flexDirection='column'>
      <Text>In the settlement...</Text>
    </Box>
  )
}
