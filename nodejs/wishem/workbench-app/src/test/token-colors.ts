import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Theme = 'light' | 'dark'

export const themes: Theme[] = ['light', 'dark']

const tokensCss = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8')

/**
 * Custom properties declared in tokens.css, name (no dashes) to raw value.
 */
export const declarations = new Map<string, string>(
  [...tokensCss.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
)

/**
 * Splits `a, b` at the top-level comma.
 */
const splitArguments = (text: string): [string, string] => {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
    } else if (char === ',' && depth === 0) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()]
    }
  }
  throw new Error(`no top-level comma in "${text}"`)
}

/**
 * Resolves a value (hex, var(), light-dark()) to a hex color for a theme.
 */
const resolve = (value: string, theme: Theme): string => {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase()
  }
  const reference = /^var\(--([\w-]+)\)$/.exec(value)
  if (reference) {
    const target = declarations.get(reference[1])
    if (target === undefined) {
      throw new Error(`tokens.css does not declare --${reference[1]}`)
    }
    return resolve(target, theme)
  }
  const lightDark = /^light-dark\((.*)\)$/s.exec(value)
  if (lightDark) {
    const [light, dark] = splitArguments(lightDark[1])
    return resolve(theme === 'light' ? light : dark, theme)
  }
  throw new Error(`cannot resolve "${value}"`)
}

/**
 * The hex color of a token in a theme.
 */
export const color = (name: string, theme: Theme) => {
  const value = declarations.get(name)
  if (value === undefined) {
    throw new Error(`tokens.css does not declare --${name}`)
  }
  return resolve(value, theme)
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

const toHex = (values: readonly number[]) =>
  `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The WCAG contrast ratio of two hex colors.
 */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Mixes `percent` of `a` with the rest of `b`, in sRGB, as `color-mix(in srgb, a percent, b)` does.
 */
export const mix = (a: string, b: string, percent: number) => {
  const weight = percent / 100
  const [ca, cb] = [channels(a), channels(b)]
  return toHex(ca.map((value, i) => value * weight + cb[i] * (1 - weight)))
}

/**
 * Multiplies each channel by `factor` and limits it to 255, as the CSS `brightness()` filter does.
 */
export const brightness = (hex: string, factor: number) =>
  toHex(channels(hex).map((value) => Math.min(255, value * factor)))
