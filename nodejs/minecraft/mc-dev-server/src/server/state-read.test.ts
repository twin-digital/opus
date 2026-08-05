import { describe, expect, it } from 'vitest'

import { observedScript, parseObserved, runningScript, shellQuote, splitSections } from './state.js'

const POOL = '/data/development_behavior_packs'

describe('the reads the harness makes off the server', () => {
  // d-jv1zleaj — the paths every reconcile reads back
  it('reads both pools, their file names, and both activation lists', () => {
    const script = observedScript('dev')

    expect(script).toContain(POOL)
    expect(script).toContain('/data/development_resource_packs')
    expect(script).toContain('/data/worlds/dev/world_behavior_packs.json')
    expect(script).toContain('/data/worlds/dev/world_resource_packs.json')
  })

  // a level name is the author's text and reaches a shell, so it is quoted
  it('quotes a level name that would otherwise end the argument', () => {
    expect(shellQuote("it's")).toBe(String.raw`'it'\''s'`)
    expect(observedScript("a' ; rm -rf /")).toContain(String.raw`'/data/worlds/a'\''`)
  })

  it('reads the served world, the worlds held, and the seed record', () => {
    expect(runningScript()).toContain('/data/server.properties')
    expect(runningScript()).toContain('/data/worlds')
    expect(runningScript()).toContain('/data/.mc-dev-server/worlds.json')
  })

  // d-a9jaqn8m — presence, identity, and file names; no content is read back
  it('rebuilds the pools and the activation lists from one read', () => {
    const uuid = 'a1111111-1111-4111-8111-111111111111'
    const read = [
      '##mc-dev-server##dirs.behavior',
      `${POOL}/${uuid}`,
      '##mc-dev-server##files.behavior',
      `${POOL}/${uuid}/manifest.json`,
      `${POOL}/${uuid}/scripts/main.js`,
      '##mc-dev-server##activation.behavior',
      JSON.stringify([{ pack_id: uuid, version: '1.2.3' }]),
      '##mc-dev-server##dirs.resource',
      '##mc-dev-server##files.resource',
      '##mc-dev-server##activation.resource',
      '##mc-dev-server##end',
    ].join('\n')

    expect(parseObserved(read)).toEqual({
      pools: { behavior: [{ uuid, kind: 'behavior', files: ['manifest.json', 'scripts/main.js'] }], resource: [] },
      activation: { behavior: [{ pack_id: uuid, version: '1.2.3' }], resource: [] },
    })
  })

  it('reads an empty pool and an unwritten activation list as nothing at all', () => {
    expect(parseObserved('##mc-dev-server##end\n')).toEqual({
      pools: { behavior: [], resource: [] },
      activation: { behavior: [], resource: [] },
    })
  })

  it('reads a pool directory holding no files as a pack with no files', () => {
    const read = ['##mc-dev-server##dirs.behavior', `${POOL}/abc`, '##mc-dev-server##end'].join('\n')

    expect(parseObserved(read).pools.behavior).toEqual([{ uuid: 'abc', kind: 'behavior', files: [] }])
  })

  it('splits a read into its sections', () => {
    expect(splitSections('##mc-dev-server##a\n1\n2\n##mc-dev-server##b\n3\n')).toEqual({ a: ['1', '2'], b: ['3', ''] })
  })
})
