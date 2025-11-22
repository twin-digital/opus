import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Campaign } from '@twin-digital/dolmenwood'
import { observer } from 'mobx-react-lite'

const campaign = new Campaign()

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
export const Footer = observer(() => {
  // const commands = useCommands()
  // const campaign = useCampaign()

  const [c, setC] = useState('')

  // const commandText = commands.map((cmd) => `${cmd.key}: ${cmd.description}`).join(' | ')
  const commandText = ''

  const dateString = `${campaign.currentDateTime.month}/${campaign.currentDateTime.day}/${campaign.currentDateTime.year}`

  useInput((input) => {
    campaign.advanceTurn(1)
    setC(input)
  })

  return (
    <Box borderDimColor borderStyle='single' paddingLeft={1} paddingRight={1} justifyContent='space-between'>
      <Text>{commandText}</Text>
      <Text>
        ?: help | {dateString} -- {c}
      </Text>
    </Box>
  )
})
