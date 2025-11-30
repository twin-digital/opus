import type { ReactNode } from 'react'
import { type BoxStyleProps, type LayoutProps } from '../theme/ink.js'
import { useTheme } from '../store/hooks.js'
import { Box, type BoxProps } from 'ink'
import { resolveColor, type ColorKey, type StateColors, type Theme, type UiState } from '../theme/colors.js'
import type { BorderStyleType } from '../theme/borders.js'
import { panelToBoxProps, type PanelStyle } from '../theme/panel.js'
import React from 'react'
import merge from 'lodash-es/merge.js'
import { StyledText } from './styled-text.js'
import { TitledBox, type BorderStyle } from '@mishieck/ink-titled-box'

export const PanelTypes = [
  // a panel which has a basic border
  'box',
  // a default panel is for structure only, and has no visual appearahce
  'default',
  // panel type used to render form fields such as text boxes
  'field',
  // surface styles have a border and special background
  'surface',
  // titled panels have a border with an embedded title
  'titled',
] as const
export type PanelType = (typeof PanelTypes)[number]

export interface PanelProps extends LayoutProps {
  /**
   * Custom background color, overrides any specified via 'type'
   */
  backgroundColor?: ColorKey

  /**
   * Custom border color, overrides any specified via 'type'
   */
  borderColor?: ColorKey

  /**
   * Optional override of the border's "dim" property.
   */
  borderDim?: boolean

  /**
   * Custom border syle, overrides any specified via 'type'
   */
  borderStyle?: BorderStyleType

  /**
   * Optional Ink-specific Box properties which will override any derived from
   * other props.
   */
  boxProps?: BoxStyleProps

  /**
   * Child content to render in the panel.
   */
  children: ReactNode

  /**
   * Component state to use when selecting styles for rendering.
   */
  state?: UiState

  /**
   * Optional title to use for this panel. If `type` is "titled", this will be embedded in the
   * border. Otherwise, it will be displayed as text with the "h1" style.
   */
  title?: string

  /**
   * Type of panel to create. This will determine default styles.
   *
   * @defaultValue 'default'
   */
  type?: PanelType
}

const makePanelStyleTypes = (theme: Theme): Record<PanelType, PanelStyle> => ({
  box: {
    borderColor: theme.border.default,
    borderStyle: 'single',
  },
  default: {},
  field: {
    backgroundColor: theme.background.input,
  },
  surface: {
    backgroundColor: theme.background.surface,
    borderColor: theme.border.subtle,
    borderStyle: 'single',
  },
  titled: {
    borderColor: theme.border.default,
    borderStyle: 'doubleSingle',
  },
})

const makeStyleProps = (
  {
    backgroundColor,
    borderColor,
    borderDim,
    borderStyle,
    boxProps,
    state,
    type = 'default',
  }: Omit<PanelProps, 'children'>,
  theme: Theme,
): Omit<BoxProps, 'borderstyle'> & { borderStyle?: BorderStyle } => {
  const styles = React.useMemo(() => makePanelStyleTypes(theme), [theme])

  const typeStyles = styles[type]
  const styleOverrides = {
    backgroundColor: backgroundColor ? resolveColor(backgroundColor, theme) : undefined,
    borderColor: borderColor ? resolveColor(borderColor, theme) : undefined,
    borderDim: borderDim,
    borderStyle,
  }
  const stateColors: StateColors = state === undefined ? {} : theme.state[state]
  const stateStyles = {
    backgroundColor: stateColors.background,
    borderColor: stateColors.border,
  }

  const styleProps = panelToBoxProps(merge({}, typeStyles, stateStyles, styleOverrides))
  return {
    ...styleProps,
    ...boxProps,
  }
}

export const Panel = ({
  backgroundColor,
  borderColor,
  borderDim,
  borderStyle,
  boxProps,
  children,
  state,
  title,
  type = 'default',
  ...rest
}: PanelProps) => {
  const theme = useTheme()

  const styleProps = makeStyleProps(
    {
      backgroundColor,
      borderColor,
      borderDim,
      borderStyle,
      boxProps,
      state,
      type,
    },
    theme,
  )

  const makeBox = () => (
    <Box {...styleProps} {...rest}>
      {title !== undefined && (
        <Panel width='100%' justifyContent='center' type='surface' borderStyle='none'>
          <StyledText type='h1'>{title}</StyledText>
        </Panel>
      )}
      {children}
    </Box>
  )

  const makeTitledBox = () => (
    <TitledBox
      titleJustify='center'
      titles={[title ?? '']}
      borderColor={theme.border.default}
      borderStyle={(styleProps.borderStyle ?? 'doubleSingle') as BorderStyle}
      {...styleProps}
      {...rest}
    >
      {children}
    </TitledBox>
  )

  return type === 'titled' ? makeTitledBox() : makeBox()
}
