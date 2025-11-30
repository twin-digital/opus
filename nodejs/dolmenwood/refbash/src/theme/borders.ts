import type { ColorToken } from './style-types.js'
import type { BoxStyleProps } from './ink.js'
import type { BorderStyle as TitledBoxBorderStyle } from '@mishieck/ink-titled-box'

export type BorderStyleType = TitledBoxBorderStyle | 'none'

/**
 * Configuration for a border style, as it is defined in our theme.
 */
export interface BorderStyle {
  color?: ColorToken
  dim?: boolean
  style?: BorderStyleType
}

export const borderToBoxProps = ({ color, dim, style }: BorderStyle): BoxStyleProps => {
  return style === 'none' ?
      {}
    : {
        borderBottomDimColor: dim,
        borderColor: color,
        borderLeftDimColor: dim,
        borderRightDimColor: dim,
        borderStyle: style,
        borderTopDimColor: dim,
      }
}
