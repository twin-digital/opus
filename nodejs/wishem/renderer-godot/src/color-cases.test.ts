import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COLOR_CASES } from '@thrashplay/wishem-sample-product/color-cases'

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'godot', 'tests', 'fixtures', 'color-cases.json')

describe('the fixture of the color cases', () => {
  it('is equal to the table of the sample product', () => {
    const text = readFileSync(fixture, 'utf8')
    expect(JSON.parse(text)).toEqual(COLOR_CASES)
  })
})
