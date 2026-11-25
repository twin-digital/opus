import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const palette = ['ink', 'wishfire', 'wisp', 'moonlight', 'clay', 'mist']
const dir = import.meta.dirname
const files = readdirSync(dir).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))

describe('components use roles only', () => {
  it('checks at least one component', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s has no hexadecimal color and no palette color name', (file) => {
    const source = readFileSync(join(dir, file), 'utf8')
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const name of palette) {
      expect(source).not.toMatch(new RegExp(`(?<![\\w-])${name}(?!\\w)`, 'i'))
    }
  })
})
