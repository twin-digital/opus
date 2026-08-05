import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createScratchWorkspace, scratchPack } from '../workspace.test.helpers.js'
import { listFiles, readBuiltOutput } from './built-output.js'

import type { ScratchWorkspace } from '../workspace.test.helpers.js'

let scratch: ScratchWorkspace | undefined

afterEach(async () => {
  await scratch?.remove()
  scratch = undefined
})

describe('reading a pack’s built output', () => {
  // r-97fvutt9 — the harness deploys built output and nothing about how it was built
  it('reports the contents of the built-output location as POSIX paths', async () => {
    const pack = scratchPack(1)
    scratch = await createScratchWorkspace([pack])
    await mkdir(join(scratch.outputDir(pack), 'functions'), { recursive: true })
    await writeFile(join(scratch.outputDir(pack), 'functions', 'hi.mcfunction'), 'say hi\n', 'utf8')

    expect(await listFiles(scratch.outputDir(pack))).toEqual([
      'functions/hi.mcfunction',
      'manifest.json',
      'scripts/main.js',
    ])
  })

  it('reports an absent output tree as no files at all', async () => {
    expect(await listFiles('/nowhere/at/all')).toEqual([])
  })

  // d-cw6pder5 — the version comes from the pack set, not from a manifest in the output tree
  it('takes the identity and version from the pack set', async () => {
    const pack = scratchPack(1, { version: '2.5.1' })
    scratch = await createScratchWorkspace([pack])
    const { discoverPacks } = await import('@twin-digital/mc-dev-kit')
    const [entry] = await discoverPacks({ workspace: scratch.root })
    if (entry.status !== 'valid') {
      throw new Error(`the scratch pack is invalid: ${JSON.stringify(entry.problems)}`)
    }

    const built = await readBuiltOutput(scratch.root, entry)

    expect(built).toMatchObject({ uuid: pack.uuid, kind: 'behavior', version: '2.5.1', packageName: pack.packageName })
    expect(built.files).toEqual(['manifest.json', 'scripts/main.js'])
  })
})
