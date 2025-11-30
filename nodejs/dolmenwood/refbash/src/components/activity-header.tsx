import React from 'react'
import { formatTime } from '../utils/time-utils.js'
import { observer } from 'mobx-react-lite'
import type { Activity } from '@twin-digital/dolmenwood'
import { StyledText } from './styled-text.js'
import { Panel } from './panel.js'

interface Props {
  activity: Activity
}

/**
 * Header component that displays summary information for the current Activity.
 * Shows location name and mode name on the left, formatted time on the right.
 * Automatically updates when game state changes via context.
 *
 * @example
 * ```tsx
 * <Header />
 * // Displays: "The Fogbound Forest | Dungeon                    02:20 PM"
 * ```
 */
export const ActivityHeader = observer(({ activity }: Props) => {
  const dateString = `${activity.endTime.month}/${activity.endTime.day}/${activity.endTime.year}`
  const { hour, turn } = activity.endTime
  const formattedTime = formatTime(hour, (turn - 1) * 10)

  return (
    <Panel
      backgroundColor='background.brandPrimary'
      minHeight={3}
      paddingY={1}
      paddingLeft={1}
      paddingRight={1}
      justifyContent='space-between'
    >
      <Panel>
        <StyledText type='h1'>{activity.title}</StyledText>
        <StyledText type='bodySecondary'> | </StyledText>
        <StyledText type='h2'>{activity.activityType}</StyledText>
      </Panel>
      <StyledText>
        {dateString} {formattedTime}
      </StyledText>
    </Panel>
  )
})
