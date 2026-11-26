import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { color, contrast, declarations, themes } from './test/token-colors.js'
import { tokenGroups } from './tokens.js'

const srcDir = import.meta.dirname
const themeCss = readFileSync(join(srcDir, 'styles', 'theme.css'), 'utf8')

const tokensOf = (group: string) => {
  const found = tokenGroups.find((g) => g.name === group)
  if (!found) {
    throw new Error(`tokens.ts has no group named "${group}"`)
  }
  return found.tokens
}

describe('palette', () => {
  const palette = {
    ink: '#17172a',
    wishfire: '#f2a93b',
    'wishfire-deep': '#9e5b0c',
    wisp: '#7fd6c6',
    'wisp-deep': '#23786b',
    moonlight: '#c2d0ea',
    'moonlight-deep': '#3f5682',
    clay: '#c8b9a9',
    mist: '#f2f2f6',
  }
  it.each(Object.entries(palette))('%s is %s in each theme', (name, value) => {
    for (const theme of themes) {
      expect(color(name, theme)).toBe(value)
    }
  })
})

describe('roles', () => {
  // role: [light, dark]
  const roles: Record<string, [string, string]> = {
    ground: ['#f7f7fa', '#121222'],
    surface: ['#ffffff', '#1b1b30'],
    fg: ['#1c1c2e', '#ececf3'],
    'fg-muted': ['#5b5b70', '#a3a3b8'],
    line: ['#dedee7', '#2d2d46'],
    'control-border': ['#85859a', '#6b6b88'],
    night: ['#17172a', '#17172a'],
    'on-night': ['#f2f2f6', '#f2f2f6'],
    'on-fill': ['#17172a', '#17172a'],
    maker: ['#f2a93b', '#f2a93b'],
    spirit: ['#7fd6c6', '#7fd6c6'],
    accent: ['#c2d0ea', '#c2d0ea'],
    'maker-text': ['#9e5b0c', '#f2a93b'],
    'spirit-text': ['#23786b', '#7fd6c6'],
    'accent-text': ['#3f5682', '#c2d0ea'],
    success: ['#8fcb3a', '#8fcb3a'],
    warning: ['#e8d44d', '#e8d44d'],
    danger: ['#e8555a', '#e8555a'],
    info: ['#7c9cf5', '#7c9cf5'],
    'success-text': ['#44700c', '#8fcb3a'],
    'warning-text': ['#735f00', '#e8d44d'],
    'danger-text': ['#c62828', '#f2666a'],
    'info-text': ['#2f52c4', '#7c9cf5'],
  }
  it.each(Object.entries(roles))('%s has the specified value in each theme', (name, [light, dark]) => {
    expect(color(name, 'light')).toBe(light)
    expect(color(name, 'dark')).toBe(dark)
  })
})

describe('scales', () => {
  it.each([
    ['radius-sm', '4px'],
    ['radius-md', '8px'],
    ['radius-lg', '12px'],
  ])('%s is %s', (name, value) => {
    expect(declarations.get(name)).toBe(value)
  })

  it('has two shadow steps', () => {
    expect(tokensOf('Shadow')).toEqual(['shadow-sm', 'shadow-md'])
    for (const name of tokensOf('Shadow')) {
      expect(declarations.has(name)).toBe(true)
    }
  })

  it.each([
    ['h1', 39],
    ['h2', 31],
    ['h3', 25],
    ['h4', 22],
    ['lead', 22],
    ['body', 18],
    ['ui', 16],
    ['control', 14],
    ['small', 13],
    ['label', 12],
  ] as const)('text size %s is %ipx', (name, size) => {
    expect(new RegExp(`--text-${name}:\\s*${size}px;`).test(themeCss)).toBe(true)
  })
})

describe('contrast', () => {
  // Derived from tokens.css, so a new text role or fill is covered wherever tokens.ts groups it.
  const names = [...declarations.keys()]
  const textRoles = [...new Set(['fg', 'fg-muted', ...names.filter((name) => name.endsWith('-text'))])]
  const fills = [
    ...new Set([...tokensOf('Fills'), ...names.filter((name) => name.endsWith('-text')).map((n) => n.slice(0, -5))]),
  ].filter((name) => declarations.has(name))

  it('covers each text role and each fill of the groups of tokens.ts', () => {
    expect(tokensOf('Text colors, on ground').filter((name) => !textRoles.includes(name))).toEqual([])
    expect(tokensOf('Fills').filter((name) => !fills.includes(name))).toEqual([])
    expect(textRoles.length).toBeGreaterThan(2)
    expect(fills.length).toBeGreaterThan(0)
  })

  const rules: { role: string; on: string; minimum: number }[] = [
    ...textRoles.flatMap((role) => ['ground', 'surface'].map((on) => ({ role, on, minimum: 4.5 }))),
    ...fills.map((on) => ({ role: 'on-fill', on, minimum: 4.5 })),
    { role: 'on-night', on: 'night', minimum: 4.5 },
    ...['ground', 'surface'].map((on) => ({ role: 'control-border', on, minimum: 3 })),
  ]

  it.each(themes.flatMap((theme) => rules.map((rule) => ({ theme, ...rule }))))(
    '$theme: $role on $on is at least $minimum',
    ({ theme, role, on, minimum }) => {
      const actual = contrast(color(role, theme), color(on, theme))
      expect(actual, `${role} on ${on} in ${theme} mode is ${actual.toFixed(2)}`).toBeGreaterThanOrEqual(minimum)
    },
  )
})

describe('token names', () => {
  const names = tokenGroups.flatMap((group) => group.tokens)

  it('declares each name of tokens.ts in tokens.css', () => {
    expect(names.filter((name) => !declarations.has(name))).toEqual([])
  })

  it('names each custom property of tokens.css in tokens.ts', () => {
    expect([...declarations.keys()].filter((name) => !names.includes(name))).toEqual([])
  })

  it('has no duplicate name', () => {
    expect(new Set(names).size).toBe(names.length)
  })
})
