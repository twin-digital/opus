import type { TextProps } from 'ink'

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type OneToNine = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type PercentString =
  | `${OneToNine}%` // 1% - 9%
  | `${OneToNine}${Digit}%` // 10% - 99%
  | '100%' // 100%
  | '0%' // 0%

export type SizeToken = number | PercentString
export type ColorToken = Exclude<TextProps['color'], undefined>
export type SpacingToken = number
