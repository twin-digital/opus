import get from 'lodash-es/get.js'
import type { ColorToken } from './style-types.js'

/**
 * Raw set of colors available in the app without any notion of how they are used.
 */
export const Palette = {
  autumnOrange100: '#E7B391',
  autumnOrange300: '#D67D43',
  autumnOrange500: '#C7682B',
  autumnOrange700: '#8D4A1E',
  autumnOrange900: '#633415',
  black: '#000000',
  gray100: '#eeeeee',
  gray300: '#c0c0c0',
  gray500: '#999999',
  gray600: '#666666',
  gray700: '#494949',
  gray800: '#333333',
  gray900: '#222222',
  white: '#ffffff',

  // semantic / status colors - https://miro.medium.com/v2/resize:fit:1358/1*jglFchy9-ZhiDZke7BtsZQ.png
  errorRed200: '#FECDC7',
  errorRed500: '#f04438',
  errorRed900: '#7a271a',
  infoBlue200: '#b2ccff',
  infoBlue500: '#2970ff',
  infoBlue900: '#00359e',
  warningOrange200: '#fedf89',
  warningOrange500: '#fdb022',
  warningOrange700: '#b54708',
  warningOrange900: '#7a2a0e',
  successGreen100: '#D1FADF',
  successGreen200: '#A6F4C5',
  successGreen300: '#6CE9A6',
  successGreen400: '#32D38E',
  successGreen500: '#12B76A',
  successGreen600: '#079455',
  successGreen700: '#067647',
  successGreen800: '#085C3C',
  successGreen900: '#044A2B',
  // 🌿 Ancient Moss — more olive/earthy but brightened for dark terminals
  ancientMoss100: '#B4CC7A',
  ancientMoss300: '#80A740',
  ancientMoss500: '#5F8C34', // the “closest to moss” option
  ancientMoss700: '#3A5A1F',
  ancientMoss900: '#223511',
} as const satisfies Record<string, ColorToken>
export type Palette = typeof Palette
export type PaletteKey = keyof Palette

/**
 * Arbitrary map of (name, color) tuples
 */
type ColorSet = Record<string, ColorToken>

/**
 * Define a specialized type of ColorSet which requires names to be shade tokens.
 */
type Shade = 100 | 300 | 500 | 700 | 900
type ShadeMap = Record<Shade, ColorToken>

export const UiStates = [
  //
  'current',
  'destructive',
  'disabled',
  'error',
  'focus',
  'info',
  'success',
  'warning',
] as const
export type UiState = (typeof UiStates)[number]
export type StateColors = Partial<Record<'background' | 'border' | 'text', ColorToken>>

/**
 * Color design system, adding semantic meaning to colors used in the app.
 */
export const Colors = {
  brand: {
    primary: {
      100: Palette.ancientMoss100,
      300: Palette.ancientMoss300,
      500: Palette.ancientMoss500,
      700: Palette.ancientMoss700,
      900: Palette.ancientMoss900,
    },
    secondary: {
      100: Palette.autumnOrange100,
      300: Palette.autumnOrange300,
      500: Palette.autumnOrange500,
      700: Palette.autumnOrange700,
      900: Palette.autumnOrange900,
    },
  },
  state: {
    current: {
      border: Palette.ancientMoss100,
    },
    destructive: {
      text: Palette.errorRed500,
    },
    disabled: {
      background: Palette.gray900,
      border: Palette.gray900,
      text: Palette.gray600,
    },
    error: {
      background: Palette.errorRed900,
      border: Palette.errorRed500,
      text: Palette.errorRed200,
    },
    focus: {
      border: Palette.ancientMoss700,
      background: Palette.ancientMoss900,
      text: Palette.gray300,
    },
    info: {
      background: Palette.infoBlue900,
      border: Palette.infoBlue500,
      text: Palette.infoBlue200,
    },
    success: {
      background: Palette.successGreen900,
      border: Palette.successGreen700,
      text: Palette.successGreen200,
    },
    warning: {
      background: Palette.warningOrange900,
      border: Palette.warningOrange700,
      text: Palette.warningOrange200,
    },
  },
  border: {
    strong: Palette.gray500,
    default: Palette.gray700,
    subtle: Palette.gray900,
  },
  background: {
    default: Palette.black,
    brandPrimary: Palette.ancientMoss900,
    brandSecondary: Palette.autumnOrange900,
    input: Palette.gray800,
    surface: Palette.gray900,
  },
  text: {
    accent: Palette.autumnOrange300,
    brandPrimary: Palette.ancientMoss300,
    brandSecondary: Palette.autumnOrange300,
    default: Palette.gray500,
    inverted: Palette.gray900,
    muted: Palette.gray800,
    strong: Palette.gray100,
    subtle: Palette.gray600,
  },
} as const satisfies {
  background: ColorSet
  border: ColorSet
  brand: {
    primary: ShadeMap
    secondary: ShadeMap
  }
  state: Record<UiState, StateColors>
  text: ColorSet
}

export type Theme = typeof Colors
export type TextColor = Theme['text']
export type BackgroundColor = Theme['background']
export type BorderColor = Theme['border']

type Join<K, P> =
  K extends string | number ?
    P extends string | number ?
      `${K}${'' extends P ? '' : '.'}${P}`
    : never
  : never

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]]

type Leaves<T, D extends number = 10> =
  [D] extends [never] ? never
  : T extends object ? { [K in keyof T]-?: Join<K, Leaves<T[K], Prev[D]>> }[keyof T]
  : ''

export type ColorKey = Leaves<typeof Colors>

export const resolveColor = (key: ColorKey, theme: Theme): ColorToken => get(theme, key)
