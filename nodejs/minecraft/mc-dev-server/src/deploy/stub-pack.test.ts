import { describe, expect, it } from 'vitest'

import { STUB_SCRIPT, stubPayload } from './stub-pack.js'

import type { ValidPackEntry } from '@twin-digital/mc-dev-kit'

const entry = (modules: { type: string }[], scriptOutput: string | null): ValidPackEntry =>
  ({
    status: 'valid',
    kind: 'behavior',
    packageName: '@scope/one',
    packageDir: 'packs/one',
    sourceDir: 'packs/one/behavior_pack',
    outputDir: 'packs/one/dist/behavior_pack',
    scriptOutput,
    uuid: 'a1111111-1111-4111-8111-111111111111',
    version: '1.0.0',
    manifest: {
      format_version: 2,
      header: { name: 'one', uuid: 'a1111111-1111-4111-8111-111111111111', version: '1.0.0' },
      modules,
    },
    problems: [],
  }) as unknown as ValidPackEntry

describe('stubPayload', () => {
  // d-vrq7lc2o — the pack's own identity, version and content, and a script that does nothing
  it('carries the completed manifest and an inert script', () => {
    const payload = stubPayload(entry([{ type: 'script' }], 'packs/one/dist/behavior_pack/scripts/main.js'))

    expect(Object.keys(payload).sort()).toEqual(['manifest.json', 'scripts/main.js'])
    expect(payload['scripts/main.js']).toBe(STUB_SCRIPT)
    expect(JSON.parse(payload['manifest.json'] ?? '')).toMatchObject({
      header: { uuid: 'a1111111-1111-4111-8111-111111111111', version: '1.0.0' },
    })
  })

  // the stub sits where the bundle will sit, so the swap does not grow the file set
  it('places the stub at the script location the pack set reports', () => {
    const payload = stubPayload(entry([{ type: 'script' }], 'packs/one/dist/behavior_pack/scripts/main.js'))

    expect(payload).toHaveProperty(['scripts/main.js'])
  })

  it('stubs no script for a pack whose manifest declares none', () => {
    const payload = stubPayload(entry([{ type: 'data' }], 'packs/one/dist/behavior_pack/scripts/main.js'))

    expect(Object.keys(payload)).toEqual(['manifest.json'])
  })
})
