import type { BorderStyle } from '@mishieck/ink-titled-box'
import type { BoxProps, TextProps } from 'ink'

export const LayoutPropNames = [
  'alignItems',
  'alignSelf',
  'columnGap',
  'display',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'gap',
  'height',
  'justifyContent',
  'margin',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'marginX',
  'marginY',
  'minHeight',
  'minWidth',
  'overflow',
  'overflowX',
  'overflowY',
  'padding',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingX',
  'paddingY',
  'position',
  'rowGap',
  'width',
] as const satisfies (keyof BoxProps)[]
export type LayoutPropName = (typeof LayoutPropNames)[number]
export type LayoutProps = Pick<BoxProps, LayoutPropName>

export const BoxStylePropNames = [
  'backgroundColor',
  'borderBottom',
  'borderBottomColor',
  'borderBottomDimColor',
  'borderColor',
  'borderDimColor',
  'borderLeft',
  'borderLeftColor',
  'borderLeftDimColor',
  'borderRight',
  'borderRightColor',
  'borderRightDimColor',
  'borderTop',
  'borderTopColor',
  'borderTopDimColor',
] as const satisfies (keyof BoxProps)[]
export type BoxStylePropName = (typeof BoxStylePropNames)[number]
export type BoxStyleProps = Pick<BoxProps, BoxStylePropName> & { borderStyle?: BorderStyle }

export const TextStylePropNames = [
  'backgroundColor',
  'bold',
  'color',
  'dimColor',
  'inverse',
  'italic',
  'strikethrough',
  'underline',
  'wrap',
] as const satisfies (keyof TextProps)[]
export type TextStylePropName = (typeof TextStylePropNames)[number]
export type TextStyleProps = Pick<TextProps, TextStylePropName>
