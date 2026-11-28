import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { examples } from '@thrashplay/wishem-hub/link/examples'

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'godot', 'tests', 'fixtures', 'link-examples.json')

describe('the fixture of the link examples', () => {
  it('is equal to the examples of the hub', () => {
    const text = readFileSync(fixture, 'utf8')
    expect(JSON.parse(text)).toEqual(examples)
  })
})
