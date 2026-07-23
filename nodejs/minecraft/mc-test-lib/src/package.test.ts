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
    expect(manifest.devDependencies?.['@minecraft/server']).toBeDefined()
  })

  it('typechecks against exactly the pinned declarations', () => {
    // The dev copy resolves via the workspace catalog (^2.8.0); every fidelity derivation is
    // transcribed from 2.8.0, so a lockfile refresh that drifts the resolved version must
    // fail loudly here rather than silently retarget the derivations.
    const resolved = JSON.parse(
      readFileSync(new URL('../node_modules/@minecraft/server/package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    expect(resolved.version).toBe('2.8.0')
  })

  it('references no test framework outside devDependencies', () => {
    const frameworks = ['vitest', 'jest', 'mocha', 'ava']
    for (const name of frameworks) {
      expect(manifest.dependencies?.[name]).toBeUndefined()
      expect(manifest.peerDependencies?.[name]).toBeUndefined()
    }
  })
})
