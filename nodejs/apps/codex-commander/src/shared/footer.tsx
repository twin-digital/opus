import React from 'react'
import { Box, Text } from 'ink'
import { useCommands, useGameState } from './game-context.js'

/**
 * Footer component that displays available keyboard commands and date.
 * Shows mode-specific commands on the left, help command and date on the right.
 * Commands are automatically updated when mode screens call useSetCommands.
 *
 * @example
 * ```tsx
 * <Footer />
 * // Displays: "t: next turn | w: check wandering monsters    ?: help | 3rd of Coldwane"
 * ```
 */
export const Footer = () => {
  const commands = useCommands()
  const { date } = useGameState()

  const commandText = commands.map((cmd) => `${cmd.key}: ${cmd.description}`).join(' | ')

  return (
    <Box borderDimColor borderStyle='single' paddingLeft={1} paddingRight={1} justifyContent='space-between'>
      <Text>{commandText}</Text>
      <Text>?: help | {date}</Text>
    </Box>
  )
}
