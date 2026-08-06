import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { declaresScript, packageManagerFor, runScriptArgv } from './scripts.js'

describe("running a package's own scripts", () => {
  // d-j3ayhwv1 — the harness invokes a package's own build and watch scripts
  it('runs a named script through the workspace manager', () => {
    expect(runScriptArgv('pnpm', 'build')).toEqual(['pnpm', ['run', 'build']])
    expect(runScriptArgv('npm', 'watch')).toEqual(['npm', ['run', 'watch']])
  })

  // d-xnv5kh7k — a pnpm marker selects pnpm, npm is the fallback
  it.each([
    ['pnpm-workspace.yaml', 'pnpm'],
    ['pnpm-workspace.yml', 'pnpm'],
  ])('takes pnpm where the root holds %s', async (marker, expected) => {
    const root = await mkdtemp(join(tmpdir(), 'mc-dev-server-ws-'))
    await writeFile(join(root, marker), 'packages: []\n', 'utf8')

    expect(packageManagerFor(root)).toBe(expected)
  })

  it('falls back to npm', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc-dev-server-ws-'))
    await mkdir(join(root, 'packages'), { recursive: true })

    expect(packageManagerFor(root)).toBe('npm')
  })

  // d-n81zkitr — a package declaring no watch script is built once and not watched
  it('tells a declared script from an absent one', () => {
    expect(declaresScript({ scripts: { build: 'tsdown' } }, 'build')).toBe(true)
    expect(declaresScript({ scripts: { build: 'tsdown' } }, 'watch')).toBe(false)
    expect(declaresScript({}, 'build')).toBe(false)
  })
})
