/**
 * The manifest is part of this package's surface: the one entry point a consumer reaches it by,
 * the tree an install must carry, and the prefix an adventure's build spells its actors under.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

interface Manifest {
  name: string
  private?: boolean
  license?: string
  type?: string
  exports: Record<string, unknown>
  files: string[]
  engines?: Record<string, string>
  minecraft?: Record<string, unknown>
}

const packageRoot = path.join(new URL('.', import.meta.url).pathname, '..')
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as Manifest

describe('the package a consumer depends on', () => {
  it('is @twin-digital/rpg-core, private and publishing nowhere', () => {
    expect(manifest.name).toBe('@twin-digital/rpg-core')
    expect(manifest.private).toBe(true)
    expect(manifest.license).toBe('UNLICENSED')
  })

  it('would carry dist and vendored_pack, an install reading the vendored tree from the tarball', () => {
    expect(manifest.files).toContain('dist')
    expect(manifest.files).toContain('vendored_pack')
  })

  it('declares rpg as the prefix an adventure naming none of its own spells an actor under', () => {
    expect(manifest.minecraft).toMatchObject({ defaultAlias: 'rpg' })
  })

  it('supports the current Node LTS', () => {
    expect(manifest.engines?.node).toBe('24.x')
  })
})

describe('the exports map', () => {
  it('offers one entry point and no subpath wildcard', () => {
    expect(Object.keys(manifest.exports)).toEqual(['.'])
    expect(JSON.stringify(manifest.exports)).not.toContain('*')
  })

  it('ships ESM with its own declarations, and resolves to no CommonJS file', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.exports['.']).toEqual({
      import: { source: './src/index.ts', types: './dist/index.d.ts', import: './dist/index.js' },
    })
    expect(JSON.stringify(manifest.exports)).not.toContain('require')
    expect(JSON.stringify(manifest.exports)).not.toContain('.cjs')
  })
})
