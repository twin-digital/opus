import { Box, type BoxProps, Text } from 'ink'
import React, { useMemo } from 'react'

interface Props extends BoxProps {
  /**
   * Log entries to render in this panel.
   */
  entries: string[]

  /**
   * Height of this panel, in terminal rows. The LogPanel requires height, and it must be specified as a number (not %).
   */
  height: number
}

export const LogPanel = ({ entries, height, ...boxProps }: Props) => {
  const visibleEvents = useMemo(() => {
    const topPadding = boxProps.paddingTop ?? boxProps.padding ?? 0
    const bottomPadding = boxProps.paddingBottom ?? boxProps.padding ?? 0
    const logRows = height - (topPadding + bottomPadding)

    if (entries.length <= logRows) {
      return entries
    }

    // Show the most recent events that fit
    return entries.slice(-logRows)
  }, [entries, height])

  return (
    <Box width='20%' height='100%' {...boxProps}>
      {visibleEvents.length === 0 ?
        <Text dimColor>No events yet</Text>
      : visibleEvents.map((event, index) => (
          <Text key={index} wrap='truncate'>
            {event}
          </Text>
        ))
      }
    </Box>
  )
}
