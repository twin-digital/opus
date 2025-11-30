import React, { type ReactNode } from 'react'
import { Text } from 'ink'
import { useTheme } from '../store/hooks.js'
import type { TextStyleProps } from '../theme/ink.js'
import { resolveColor, type ColorKey, type StateColors, type Theme, type UiState } from '../theme/colors.js'
import { toTextProps, type TextStyle } from '../theme/text.js'
import merge from 'lodash-es/merge.js'

export const textStyleTypeNames = [
  'body',
  'bodySecondary',
  'destructive',
  'disabled',
  'error',
  'h1',
  'h2',
  'info',
  'label',
  'strong',
  'success',
  'warning',
] as const
export type TextStyleType = (typeof textStyleTypeNames)[number]

const makeTextStyleTypes = (theme: Theme): Record<TextStyleType, TextStyle> =>
  ({
    body: { color: theme.text.default },
    bodySecondary: { color: theme.text.subtle },
    strong: { color: theme.text.strong },
    destructive: { color: theme.state.destructive.text },
    disabled: { color: theme.state.disabled.text },
    error: { color: theme.state.error.text },
    h1: { color: theme.text.brandPrimary },
    h2: { color: theme.text.brandSecondary },
    info: { color: theme.state.info.text },
    label: { color: theme.text.accent },
    success: { color: theme.state.success.text },
    warning: { color: theme.state.warning.text },
  }) as const

interface Props {
  /**
   * Sets the background color to an arbitrary entry from the application's theme. This will override any color
   * assigned to the specified text {@link type}.
   */
  backgroundColor?: ColorKey

  /**
   * Content to render in this text node.
   */
  children: ReactNode

  /**
   * Sets the color to an arbitrary entry from the application's theme. This will override any color assigned
   * to the specified text {@link type}.
   */
  color?: ColorKey

  /**
   * Component state to use when selecting styles for rendering.
   */
  state?: UiState

  /**
   * Optional styles to apply to this text. This will override any value assinged by this text's {@link type}.
   */
  style?: TextStyle['style']

  /**
   * Optional properties specified on Ink's "Text" type to use as overrides. Will supersede props derived
   * from 'style' and 'type'.
   */
  textProps?: TextStyleProps

  /**
   * Type of style to use when rendering this text.
   * @defaultValue 'body'
   */
  type?: TextStyleType
}

export const StyledText = ({ backgroundColor, color, children, state, style, textProps, type = 'body' }: Props) => {
  const theme = useTheme()
  const styles = React.useMemo(() => makeTextStyleTypes(theme), [theme])

  const typeStyles = styles[type]
  const styleOverrides = {
    backgroundColor: backgroundColor ? resolveColor(backgroundColor, theme) : undefined,
    color: color ? resolveColor(color, theme) : undefined,
    style,
  }

  const stateColors: StateColors = state === undefined ? {} : theme.state[state]
  const stateStyles = {
    backgroundColor: stateColors.background,
    borderColor: stateColors.border,
    color: stateColors.text,
  }

  const styleProps = toTextProps(merge({}, typeStyles, stateStyles, styleOverrides))
  return (
    <Text {...styleProps} {...textProps}>
      {children}
    </Text>
  )
}
