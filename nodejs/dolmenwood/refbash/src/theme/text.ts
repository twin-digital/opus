import type { TextStyleProps } from './ink.js'
import type { ColorToken } from './style-types.js'

/**
 * Configuration for a text style, as it is defined in our theme.
 */
export interface TextStyle {
  backgroundColor?: ColorToken
  color?: ColorToken
  style?: ('bold' | 'dim' | 'inverse' | 'italic' | 'strikethrough' | 'underline')[]
}

type TextStyleFlag = NonNullable<TextStyle['style']>[number]

/**
 * Converts a text style from our theme to the prop type required by Ink.
 */
export const toTextProps = ({ backgroundColor, color, style }: TextStyle): TextStyleProps => {
  const hasStyle = (name: TextStyleFlag) => style?.includes(name) ?? false

  return {
    backgroundColor,
    bold: hasStyle('bold'),
    color,
    dimColor: hasStyle('dim'),
    inverse: hasStyle('inverse'),
    italic: hasStyle('italic'),
    strikethrough: hasStyle('strikethrough'),
    underline: hasStyle('underline'),
  }
}
