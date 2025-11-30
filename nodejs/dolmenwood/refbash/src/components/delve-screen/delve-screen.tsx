import React, { useEffect, useState } from 'react'
import { Box } from 'ink'
import { LogPanel } from '..//log-panel.js'
import { Delve } from '@twin-digital/dolmenwood'
import { observer } from 'mobx-react-lite'
import { LightSourcesTable } from './light-sources-table.js'
import { AddLightSourceForm } from './add-light-source-form.js'
import { InputLayer } from '../../input/input-controller.js'
import { StyledText } from '../styled-text.js'
import { useUi } from '../../store/hooks.js'

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
  const ui = useUi()
  const input = ui.input
  const [focus, setFocus] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<string | null>(null)

  // Set commands on mount
  // useEffect(() => {
  //   setCommands([
  //     { key: 't/T', description: 'turn +1/-1' },
  //     { key: 'w', description: 'check wandering monsters' },
  //     { key: 'm', description: 'change mode' },
  //   ])
  // }, [setCommands])

  useEffect(() => {
    const layer = new InputLayer('screen:delve')

    if (focus === 'light-sources') {
      layer.addAction(
        'a',
        () => {
          setActiveForm('add-light-source')
        },
        'add light source',
      )

      layer.addAction(
        'escape',
        () => {
          setFocus('null')
          setActiveForm(null)
        },
        'back',
      )
    } else {
      layer.addAction(
        'l',
        () => {
          setFocus('light-sources')
        },
        'light sources',
      )

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
    }

    input.register(layer)
    return () => {
      input.remove(layer.id)
    }
  }, [activeForm, delve, focus, input, setActiveForm, setFocus])

  const renderForm = () => {
    switch (activeForm) {
      case 'add-light-source':
        return (
          <Box width={'100%'}>
            <AddLightSourceForm
              onCancel={() => {
                setActiveForm(null)
              }}
              onSubmit={(light) => {
                delve.addLightSource(light)
                setActiveForm(null)
              }}
            />
          </Box>
        )
      default:
        return null
    }
  }

  const form = renderForm()

  return (
    <>
      <Box flexDirection='row' width='100%' height='100%'>
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
        </Box>

        {/* Middle column (2/5) - turn track */}
        <Box
          width='40%'
          height='100%'
          paddingX={1}
          borderRight={true}
          borderDimColor
          borderLeft={false}
          borderTop={false}
          borderBottom={false}
          flexDirection='column'
        >
          <StyledText>Turn: {delve.turns}</StyledText>

          {/* <StyleGuide /> */}
        </Box>

        {/* Right column (1/5) - event log */}
        <LogPanel
          backgroundColor='black'
          entries={[] /* eventLog */}
          flexDirection='column'
          height={rows}
          overflow='hidden'
          paddingLeft={1}
          width='20%'
        />
      </Box>
      {form && <Box marginTop={1}>{form}</Box>}
    </>
  )
})
