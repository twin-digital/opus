import React from 'react'
import { Box, Text } from 'ink'
import { useCampaign } from './game-context.js'
import { formatTime } from './time-utils.js'

/**
 * Header component that displays current game state information.
 * Shows location name and mode name on the left, formatted time on the right.
 * Automatically updates when game state changes via context.
 *
 * @example
 * ```tsx
 * <Header />
 * // Displays: "The Fogbound Forest | Dungeon                    02:20 PM"
 * ```
 */
export const Header = () => {
  const campaign = useCampaign()
  const modeName = 'zazzy'

  const { hour, turn } = campaign.currentDateTime
  const formattedTime = formatTime(hour, (turn - 1) * 10)

  return (
    <Box borderDimColor borderStyle='single' paddingLeft={1} paddingRight={1} justifyContent='space-between'>
      <Text>
        Unknown | <Text color='blue'>{modeName}</Text>
      </Text>
      <Text>{formattedTime}</Text>
    </Box>
  )
}
