import { describe, expect, it } from 'vitest'

import { DEFAULT_IMAGE, DEFAULT_PORT, SelectionError, resolveSettings, selectPacks } from './resolve.js'

import type { WorkspaceConfig } from '../config/types.js'
import type { PackEntry } from '@twin-digital/mc-dev-kit'

const config: WorkspaceConfig = {
  level: 'config-level',
  seed: 1n,
  profiles: {
    scripts: { packs: ['@scope/one'], level: 'profile-level', seed: 2n },
    everything: {},
    none: { packs: [] },
  },
}

const entry = (packageName: string): PackEntry =>
  ({
    status: 'valid',
    kind: 'behavior',
    packageName,
    packageDir: `packs/${packageName}`,
    sourceDir: `packs/${packageName}/behavior_pack`,
    outputDir: `packs/${packageName}/dist/behavior_pack`,
    uuid: 'a1111111-1111-4111-8111-111111111111',
    version: '1.0.0',
    manifest: { header: {}, modules: [] },
    problems: [],
  }) as unknown as PackEntry

describe('resolveSettings', () => {
  // d-41m3iws5 — defaults, config, profile, command line, in that order
  it('lets the command line override the profile, and the profile the config', () => {
    expect(resolveSettings(config, { profile: 'scripts', level: 'cli-level' })).toMatchObject({
      level: 'cli-level',
      seed: 2n,
    })
  })

  it('takes the config top level where no profile applies', () => {
    expect(resolveSettings(config)).toMatchObject({ level: 'config-level', seed: 1n })
  })

  // d-wkcxcv2b — every setting has a default, so an empty config is a complete run
  it('supplies the harness defaults for image and port', () => {
    const settings = resolveSettings({})

    expect(settings).toMatchObject({ image: DEFAULT_IMAGE, port: DEFAULT_PORT, eula: false })
    expect(settings.level).toBeUndefined()
    expect(settings.seed).toBeUndefined()
  })

  // d-c1kvyord — defaultProfile applies where the command line names none
  it('applies defaultProfile when no profile is named', () => {
    expect(resolveSettings({ ...config, defaultProfile: 'scripts' })).toMatchObject({
      profile: 'scripts',
      packs: ['@scope/one'],
    })
  })

  // d-c1kvyord — a profile naming no packs leaves the run hosting everything
  it('hosts everything for a profile that names no packs', () => {
    expect(resolveSettings(config, { profile: 'everything' }).packs).toBeUndefined()
  })

  // d-c1kvyord — an empty pack list selects no packs, which is a valid run
  it('hosts nothing for a profile whose pack list is empty', () => {
    expect(resolveSettings(config, { profile: 'none' }).packs).toEqual([])
  })

  // d-c1kvyord — a --profile naming no profile the config holds is an error
  it('rejects a profile the config does not hold', () => {
    expect(() => resolveSettings(config, { profile: 'absent' })).toThrow(SelectionError)
    expect(() => resolveSettings({}, { profile: 'absent' })).toThrow(SelectionError)
  })

  // d-e956frnx — either way of accepting counts
  it('accepts the EULA from the flag or the config', () => {
    expect(resolveSettings({}, { acceptEula: true }).eula).toBe(true)
    expect(resolveSettings({ eula: true }).eula).toBe(true)
  })
})

describe('selectPacks', () => {
  const entries = [entry('@scope/one'), entry('@scope/two')]

  // r-u8cg9vi6 — no selection hosts every discovered pack
  it('hosts every pack when nothing narrows the run', () => {
    expect(selectPacks(entries)).toEqual(entries)
  })

  it('hosts exactly the selected packages', () => {
    expect(selectPacks(entries, ['@scope/two'])).toEqual([entries[1]])
  })

  it('hosts nothing for an empty selection', () => {
    expect(selectPacks(entries, [])).toEqual([])
  })

  // d-n81zkitr — a selection naming something the workspace does not hold fails the run
  it('rejects a selection naming a package the workspace does not hold', () => {
    expect(() => selectPacks(entries, ['@scope/absent'])).toThrow(SelectionError)
  })
})
