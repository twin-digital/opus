import React, { type ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import { StyledText } from './styled-text.js'
import { useUi } from '../store/hooks.js'
import { Panel } from './panel.js'

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
  const ui = useUi()

  const commands = ui.input.hints.reduce<ReactNode[]>(
    (result, { description, keyBind }) => [
      ...result,
      <Panel>
        <StyledText type='label'>{keyBind}</StyledText>
        <StyledText>:{description}</StyledText>
      </Panel>,
    ],
    [],
  )

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
        {commands}
      </Panel>
      <StyledText>?: help</StyledText>
    </Panel>
  )
})
