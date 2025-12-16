import React, { useState } from 'react'
import { Box } from 'ink'
import { LogPanel } from '../log-panel/log-panel.js'
import { Delve } from '@twin-digital/dolmenwood'
import { observer } from 'mobx-react-lite'
import { LightSourcesTable } from './light-sources-table.js'
import { LayerPriority } from '../../input/input-controller.js'
import { StyledText } from '../styled-text.js'
import { formatTime } from '../../utils/time-utils.js'
import { Panel } from '../panel.js'
import { EncounterPanel } from '../encounter/encounter-panel.js'
import { useInputLayer } from '../../input/use-input-layer.js'

interface DelveScreenProps {
  /**
   * The Delve for which the screen is being rendered.
   */
  delve: Delve

  /**
   * Number of terminal rows available to this component.
   */
  rows: number

  /**
   * Initial turn number to start on.
   */
  initialTurn?: number
}

/**
 * Dungeon mode screen component.
 * Displays a turn counter and handles turn advancement.
 * Automatically updates header state and registers dungeon-specific commands.
 *
 * @param props - Component props
 * @param props.initialTurn - Optional starting turn number (1-6), defaults to 1
 *
 * @example
 * ```tsx
 * <DelveScreeen initialTurn={3} />
 * ```
 */
export const DelveScreeen = observer(({ delve, rows }: DelveScreenProps) => {
  const [focus, setFocus] = useState<string | null>(null)

  // global actions
  useInputLayer(
    (layer) => {
      if (focus !== null) {
        layer.addAction(
          'escape',
          () => {
            setFocus(null)
          },
          'back',
        )
      }

      layer.addAction(
        't',
        () => {
          delve.advanceTurn(1)
        },
        '+1 turn',
      )

      layer.addAction(
        'T',
        () => {
          delve.advanceTurn(-1)
        },
        '-1 turn',
      )
    },
    {
      global: true,
      priority: LayerPriority.Screen,
    },
    [delve, focus, setFocus],
  )

  // non-global actions
  useInputLayer(
    (layer) => {
      if (delve.activeEncounter !== undefined) {
        layer.addAction(
          'e',
          () => {
            setFocus('encounter')
          },
          'encounter',
        )
      }

      layer.addAction(
        'l',
        () => {
          setFocus('light-sources')
        },
        'light sources',
      )

      layer.addAction(
        'm',
        () => {
          setFocus('message-log')
        },
        'message log',
      )

      layer.addAction(
        'w',
        () => {
          delve.checkForWanderingMonsters('ad-hoc')
        },
        'wandering check',
      )
    },
    {
      priority: LayerPriority.Screen,
    },
    [delve, delve.activeEncounter, setFocus],
  )

  return (
    <>
      <Box flexDirection='row' width='100%' height='100%' columnGap={1}>
        {/* Left column (2/5) - blank for now */}
        <Box
          width='40%'
          height='100%'
          borderDimColor
          borderRight={true}
          borderLeft={false}
          borderTop={false}
          borderBottom={false}
          flexDirection='column'
        >
          <LightSourcesTable delve={delve} focused={focus === 'light-sources'} />
          {/* <StyleGuide /> */}
        </Box>

        {/* Middle column (2/5) - turn track */}
        <Box
          width='40%'
          height='100%'
          borderRight={true}
          borderDimColor
          borderLeft={false}
          borderTop={false}
          borderBottom={false}
          flexDirection='column'
        >
          <LogPanel
            eventLog={delve.eventLog}
            flexDirection='column'
            focused={focus === 'message-log'}
            getText={(_, event) =>
              `${formatTime(event.gameTime.hour, (event.gameTime.turn - 1) * 10)}: ${event.description}`
            }
            height={Math.min(rows, 10)}
            overflow='hidden'
          />

          {delve.activeEncounter && (
            <EncounterPanel encounter={delve.activeEncounter} focused={focus === 'encounter'} />
          )}
        </Box>

        {/* Right column (1/5) - event log */}
        <Panel flexDirection='column' width='20%'>
          <Panel title='Overview' type='titled'>
            <StyledText>Turn: {delve.turns}</StyledText>
          </Panel>

          <Panel flexDirection='column' title='Wandering Monsters' type='titled'>
            <StyledText>
              Frequency:{' '}
              {delve.wanderingMonsterConfig.checkFrequencyType === 'probability' ?
                `${delve.wanderingMonsterConfig.checkFrequency}%`
              : `every ${delve.wanderingMonsterConfig.checkFrequency} turns`}
            </StyledText>

            <StyledText>Chance&nbsp;&nbsp;&nbsp;: {delve.wanderingMonsterConfig.chance}-in-6</StyledText>
          </Panel>
        </Panel>
      </Box>
    </>
  )
})
