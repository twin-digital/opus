import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Manifest

describe('package manifest', () => {
  // PK1: zero runtime dependencies, the pinned peer, and no test framework outside dev.
  it('declares no runtime dependencies', () => {
    expect(manifest.dependencies).toBeUndefined()
  })

  it('pins @minecraft/server 2.8.0 as the peer range', () => {
    expect(manifest.peerDependencies).toEqual({ '@minecraft/server': '2.8.0' })
  })

  it('references no test framework outside devDependencies', () => {
    const frameworks = ['vitest', 'jest', 'mocha', 'ava']
    for (const name of frameworks) {
      expect(manifest.dependencies?.[name]).toBeUndefined()
      expect(manifest.peerDependencies?.[name]).toBeUndefined()
    }
  })
})
