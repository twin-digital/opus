import React from 'react'
import { observer } from 'mobx-react-lite'
import { StyledText } from '../styled-text.js'
import { useUi } from '../../store/hooks.js'
import { Panel } from '../panel.js'

/**
 * Displays available keyboard command hints.
 * Active layer commands are shown on the left (if not global).
 * Global layer commands are shown on the right.
 *
 * @example
 * ```tsx
 * <InputHelpLine />
 * // Displays: "a: set awareness    q: quit | ?: help"
 * ```
 */
export const InputHelpLine = observer(() => {
  const ui = useUi()

  const activeCommands = ui.input.activeActionHints.map(({ description, keyBind }) => (
    <Panel key={keyBind}>
      <StyledText type='label'>{keyBind}</StyledText>
      <StyledText>:{description}</StyledText>
    </Panel>
  ))

  const globalCommands = ui.input.globalActionHints.map(({ description, keyBind }) => (
    <Panel key={keyBind}>
      <StyledText type='label'>{keyBind}</StyledText>
      <StyledText>:{description}</StyledText>
    </Panel>
  ))

  return (
    <Panel
      boxProps={{
        borderBottom: false,
        borderLeft: false,
        borderRight: false,
      }}
      type='surface'
      paddingLeft={1}
      paddingRight={1}
      justifyContent='space-between'
    >
      <Panel flexDirection='row' gap={2}>
        {activeCommands}
      </Panel>
      <Panel flexDirection='row' gap={2}>
        {globalCommands}
      </Panel>
    </Panel>
  )
})
