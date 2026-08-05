import { describe, expect, it } from 'vitest'
import type { InvalidPackEntry, PackEntry, ValidPackEntry } from '../types.js'
import { matchesCriteria } from './filter.js'

const valid: ValidPackEntry = {
  status: 'valid',
  kind: 'behavior',
  packageName: '@scope/mc-pack-1',
  packageDir: 'packages/mc-pack-1',
  sourceDir: 'packages/mc-pack-1/behavior_pack',
  outputDir: 'packages/mc-pack-1/dist/behavior_pack',
  scriptOutput: 'packages/mc-pack-1/dist/behavior_pack/scripts/main.js',
  uuid: 'aaaaaaaa-1111-2222-3333-444444444444',
  version: '1.2.3',
  manifest: {
    header: {
      name: 'Pack One',
      uuid: 'AAAAAAAA-1111-2222-3333-444444444444',
      version: '1.2.3',
    },
    modules: [{ type: 'data' }],
  },
  problems: [],
}

const invalid: InvalidPackEntry = {
  status: 'invalid',
  kind: 'resource',
  packageName: '@scope/mc-pack-1',
  packageDir: 'packages/mc-pack-1',
  sourceDir: 'packages/mc-pack-1/resource_pack',
  outputDir: 'packages/mc-pack-1/dist/resource_pack',
  scriptOutput: null,
  problems: [{ code: 'manifest-unreadable', message: 'unreadable', error: 'ENOENT' }],
}

describe('matchesCriteria', () => {
  it('matches the owning package name exactly', () => {
    expect(matchesCriteria(valid, { package: '@scope/mc-pack-1' })).toBe(true)
    expect(matchesCriteria(valid, { package: 'mc-pack-1' })).toBe(false)
    expect(matchesCriteria(valid, { package: '@SCOPE/MC-PACK-1' })).toBe(false)
  })

  it('matches the completed header name exactly', () => {
    expect(matchesCriteria(valid, { name: 'Pack One' })).toBe(true)
    expect(matchesCriteria(valid, { name: 'pack one' })).toBe(false)
    expect(matchesCriteria(valid, { name: 'Pack' })).toBe(false)
  })

  it('matches a uuid with both sides lowercased', () => {
    expect(matchesCriteria(valid, { uuid: 'AAAAAAAA-1111-2222-3333-444444444444' })).toBe(true)
    expect(matchesCriteria(valid, { uuid: 'aaaaaaaa-1111-2222-3333-444444444444' })).toBe(true)
    expect(matchesCriteria(valid, { uuid: 'bbbbbbbb-1111-2222-3333-444444444444' })).toBe(false)
  })

  it('matches the status', () => {
    expect(matchesCriteria(valid, { status: 'valid' })).toBe(true)
    expect(matchesCriteria(valid, { status: 'invalid' })).toBe(false)
    expect(matchesCriteria(invalid, { status: 'invalid' })).toBe(true)
  })

  it('requires every criterion given', () => {
    expect(matchesCriteria(valid, { package: '@scope/mc-pack-1', status: 'valid' })).toBe(true)
    expect(matchesCriteria(valid, { package: '@scope/mc-pack-1', status: 'invalid' })).toBe(false)
    expect(matchesCriteria(valid, { name: 'Pack One', uuid: 'nope' })).toBe(false)
  })

  it('never matches a criterion whose value the entry does not carry', () => {
    expect(matchesCriteria(invalid, { name: 'Pack One' })).toBe(false)
    expect(matchesCriteria(invalid, { uuid: 'aaaaaaaa-1111-2222-3333-444444444444' })).toBe(false)
  })

  it('matches every entry on empty criteria', () => {
    for (const entry of [valid, invalid] as PackEntry[]) {
      expect(matchesCriteria(entry, {})).toBe(true)
    }
  })

  it('matches valid and invalid alike where status is not constrained', () => {
    for (const entry of [valid, invalid] as PackEntry[]) {
      expect(matchesCriteria(entry, { package: '@scope/mc-pack-1' })).toBe(true)
    }
  })
})
