import type { ColorToken } from './style-types.js'
import type { BoxStyleProps } from './ink.js'
import { borderToBoxProps, type BorderStyleType } from './borders.js'

/**
 * Configuration for a panel style (colors+border) as it is defined in our theme.
 */
export interface PanelStyle {
  backgroundColor?: ColorToken
  borderColor?: ColorToken
  borderDim?: boolean
  borderStyle?: BorderStyleType
}

export const panelToBoxProps = ({
  backgroundColor,
  borderColor,
  borderDim,
  borderStyle,
}: PanelStyle): BoxStyleProps => {
  return {
    backgroundColor,
    ...borderToBoxProps({
      color: borderColor,
      dim: borderDim,
      style: borderStyle,
    }),
  }
}
