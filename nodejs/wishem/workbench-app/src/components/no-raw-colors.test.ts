import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const palette = ['ink', 'wishfire', 'wisp', 'moonlight', 'clay', 'mist']
const dir = import.meta.dirname

const hexColor = /#[0-9a-f]{3,8}\b/i
const paletteName = (name: string) => new RegExp(`(?<![a-z0-9])${name}(?![a-z0-9])`, 'i')

/** Returns the reason that the source breaks the rule, or `undefined` when it follows the rule. */
const violation = (source: string) => {
  if (hexColor.test(source)) {
    return 'hexadecimal color'
  }
  return palette.find((name) => paletteName(name).test(source))
}

const walk = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)],
  )

const files = walk(dir).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))

describe('the rule finds a palette color', () => {
  it.each([
    ['var(--ink)', 'ink'],
    ['text-(--wisp)', 'wisp'],
    ['bg-[var(--wishfire)]', 'wishfire'],
    ['bg-ink', 'ink'],
    ['var(--wishfire-deep)', 'wishfire'],
    ['border-moonlight-deep', 'moonlight'],
    ['bg-[#1c1c2e]', 'hexadecimal color'],
  ])('%s', (source, expected) => {
    expect(violation(source)).toBe(expected)
  })

  it.each(['bg-night', 'text-maker-text', 'text-fg-muted', 'text-on-night'])('%s is a role', (source) => {
    expect(violation(source)).toBeUndefined()
  })
})

describe('components use roles only', () => {
  it.each(files.map((file) => [file.slice(dir.length + 1), file]))(
    '%s has no hexadecimal color and no palette color name',
    (_name, file) => {
      expect(violation(readFileSync(file, 'utf8'))).toBeUndefined()
    },
  )
})
