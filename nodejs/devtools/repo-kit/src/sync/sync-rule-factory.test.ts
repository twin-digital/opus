import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeSyncRules } from './sync-rule-factory.js'
import type { FeatureConfigItem } from '../config/repo-kit-configuration.js'
import type { PackageMeta } from '../workspace/package-meta.js'

let dir: string
let workspace: PackageMeta

const touch = (file: string) => {
  fs.writeFileSync(path.join(dir, file), '')
}

/** Runs a single feature against the temp workspace and returns its result. */
const run = (feature: FeatureConfigItem) => {
  const [rule] = makeSyncRules({ config: {}, featureConfig: { features: [feature] } })
  return rule.configure(workspace)
}

const writeMarker = (file: string) => ({
  action: 'write-file' as const,
  options: { file, content: 'x' },
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-rules-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeSyncRules', () => {
  it('applies a feature with no conditions', async () => {
    const result = await run({ name: 'always', actions: [writeMarker('out.txt')] })

    expect(result).toEqual({ result: 'ok', changedFiles: ['out.txt'] })
    expect(fs.existsSync(path.join(dir, 'out.txt'))).toBe(true)
  })

  it('treats multiple feature-level conditions as AND', async () => {
    const feature: FeatureConfigItem = {
      name: 'both',
      conditions: [{ exists: 'a.ts' }, { exists: 'b.ts' }],
      actions: [writeMarker('out.txt')],
    }

    touch('a.ts')
    expect(await run(feature)).toEqual({ result: 'skipped' }) // only one of two present

    touch('b.ts')
    expect(await run(feature)).toEqual({ result: 'ok', changedFiles: ['out.txt'] })
  })

  it('treats multiple action-level conditions as AND', async () => {
    const feature: FeatureConfigItem = {
      name: 'action-gated',
      actions: [{ ...writeMarker('out.txt'), conditions: [{ exists: 'a.ts' }, { notExists: 'b.ts' }] }],
    }

    touch('a.ts')
    touch('b.ts')
    expect(await run(feature)).toEqual({ result: 'skipped' }) // notExists b.ts fails

    fs.rmSync(path.join(dir, 'b.ts'))
    expect(await run(feature)).toEqual({ result: 'ok', changedFiles: ['out.txt'] })
  })

  it('aggregates changed files across actions and ignores skipped ones', async () => {
    const feature: FeatureConfigItem = {
      name: 'multi',
      actions: [
        writeMarker('a.txt'),
        { ...writeMarker('b.txt'), conditions: [{ exists: 'missing.ts' }] }, // skipped
        writeMarker('c.txt'),
      ],
    }

    const result = await run(feature)

    expect(result).toEqual({ result: 'ok', changedFiles: ['a.txt', 'c.txt'] })
    expect(fs.existsSync(path.join(dir, 'b.txt'))).toBe(false)
  })

  it('reports skipped when every action is a no-op', async () => {
    fs.writeFileSync(path.join(dir, 'out.txt'), 'x') // identical to what write-file would produce
    const result = await run({ name: 'noop', actions: [writeMarker('out.txt')] })

    expect(result).toEqual({ result: 'skipped' })
  })

  it('propagates a rejection when an action throws (e.g. patching a missing file)', async () => {
    // Actions throw rather than returning an error result; sync.ts catches this at the call site.
    await expect(
      run({
        name: 'boom',
        actions: [{ action: 'json-merge-patch', options: { file: 'nope.json', patch: 'a: 1\n' } }],
      }),
    ).rejects.toThrow()
  })
})
