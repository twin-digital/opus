import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import { applyFeatures } from './sync.js'
import type { PackageFeature } from '../../sync/package-feature.js'
import type { SyncResult } from '../../sync/sync-result.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

const pkg: PackageMeta = { manifest: { name: 'pkg' }, name: 'pkg', path: '/tmp/pkg' }

const feature = (name: string, configure: () => SyncResult | Promise<SyncResult>): PackageFeature => ({
  name,
  configure,
})

describe('applyFeatures', () => {
  beforeEach(() => {
    // the feature loop is chatty; silence it so test output stays readable
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'group').mockImplementation(() => undefined)
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tallies a feature that returns an error result', async () => {
    const result = await applyFeatures(
      {},
      pkg,
      feature('boom', () => ({ result: 'error', error: new Error('nope') })),
    )

    expect(result.errorCount).toBe(1)
  })

  it('tallies a feature that throws, and continues to later features', async () => {
    const calls: string[] = []

    const result = await applyFeatures(
      {},
      pkg,
      feature('throws', () => {
        calls.push('throws')
        throw new Error('nope')
      }),
      feature('after', () => {
        calls.push('after')
        return { result: 'skipped' }
      }),
    )

    expect(result.errorCount).toBe(1)
    expect(calls).toEqual(['throws', 'after']) // failure did not abort the loop
  })

  it('does not tally ok/skipped results and aggregates changed files', async () => {
    const result = await applyFeatures(
      {},
      pkg,
      feature('a', () => ({ result: 'ok', changedFiles: ['a.txt'] })),
      feature('b', () => ({ result: 'skipped' })),
    )

    expect(result.errorCount).toBe(0)
    expect(result.changedFiles).toEqual(['a.txt'])
  })

  it('skips disabled features without running or tallying them', async () => {
    const result = await applyFeatures(
      { rules: { off: false } },
      pkg,
      feature('off', () => {
        throw new Error('should not run')
      }),
    )

    expect(result.errorCount).toBe(0)
  })
})
