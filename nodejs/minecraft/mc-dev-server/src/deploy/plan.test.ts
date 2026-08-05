import { describe, expect, it } from 'vitest'

import { planReconcile } from './plan.js'

import type { DesiredPack, ObservedServer, PooledPack } from './plan.js'

const pack = (overrides: Partial<DesiredPack> = {}): DesiredPack => ({
  uuid: 'a1111111-1111-4111-8111-111111111111',
  kind: 'behavior',
  version: '1.0.0',
  packageName: '@scope/pack-one',
  files: ['manifest.json', 'scripts/main.js'],
  sourceDir: '/ws/packs/one/dist/behavior_pack',
  ...overrides,
})

const pooled = (from: DesiredPack, files = from.files): PooledPack => ({
  uuid: from.uuid,
  kind: from.kind,
  files,
})

const server = (overrides: Partial<ObservedServer> = {}): ObservedServer => ({
  pools: { behavior: [], resource: [] },
  activation: { behavior: [], resource: [] },
  ...overrides,
})

const settled = (packs: readonly DesiredPack[]): ObservedServer => ({
  pools: {
    behavior: packs.filter((p) => p.kind === 'behavior').map((p) => pooled(p)),
    resource: packs.filter((p) => p.kind === 'resource').map((p) => pooled(p)),
  },
  activation: {
    behavior: packs.filter((p) => p.kind === 'behavior').map((p) => ({ pack_id: p.uuid, version: p.version })),
    resource: packs.filter((p) => p.kind === 'resource').map((p) => ({ pack_id: p.uuid, version: p.version })),
  },
})

describe('planReconcile', () => {
  // r-pcq10f2b, d-3ya31m19 — a run with nothing to apply applies nothing
  it('is a no-op against a server that already matches', () => {
    const one = pack()
    const plan = planReconcile({ desired: [one], observed: settled([one]) })

    expect(plan.copy).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.writeActivation).toBe(false)
    expect(plan.apply).toBe('none')
  })

  // r-pcq10f2b, d-ftlfhac8 — an added pack costs a restart
  it('copies and restarts for a pack the pool does not hold', () => {
    const one = pack()
    const plan = planReconcile({ desired: [one], observed: server() })

    expect(plan.copy).toEqual([one])
    expect(plan.writeActivation).toBe(true)
    expect(plan.apply).toBe('restart')
  })

  // r-cekp2mcb, d-ftlfhac8 — an edited file set that did not grow costs a reload
  it('reloads for a pack whose output changed without gaining a file', () => {
    const one = pack()
    const plan = planReconcile({ desired: [one], observed: settled([one]), changed: new Set([one.uuid]) })

    expect(plan.copy).toEqual([one])
    expect(plan.apply).toBe('reload')
  })

  // d-ftlfhac8 — only a file the pack did not have before forces a restart
  it('restarts for a pack that gained a file', () => {
    const one = pack()
    const observed = settled([one])
    observed.pools.behavior = [pooled(one, ['manifest.json'])]

    const plan = planReconcile({ desired: [one], observed })

    expect(plan.apply).toBe('restart')
    expect(plan.restartReasons.join(' ')).toContain('gained a file')
  })

  // d-ftlfhac8 — a file set that shrank needs no restart
  it('reloads for a pack that lost a file', () => {
    const one = pack({ files: ['manifest.json'] })
    const observed = settled([one])
    observed.pools.behavior = [pooled(one, ['manifest.json', 'functions/old.mcfunction'])]

    const plan = planReconcile({ desired: [one], observed })

    expect(plan.apply).toBe('reload')
  })

  // r-pcq10f2b, d-plnvasfo — pool content the selection does not account for is removed
  it('removes a pool directory nothing selected accounts for', () => {
    const one = pack()
    const stray: PooledPack = { uuid: 'b2222222-2222-4222-8222-222222222222', kind: 'behavior', files: [] }
    const observed = settled([one])
    observed.pools.behavior = [...observed.pools.behavior, stray]

    const plan = planReconcile({ desired: [one], observed })

    expect(plan.remove).toEqual([{ kind: 'behavior', uuid: stray.uuid }])
    expect(plan.apply).toBe('restart')
  })

  // d-cw6pder5 — the entry's uuid and version come from the pack set, in the run's selection order
  it('writes activation entries from the pack set in selection order', () => {
    const first = pack()
    const second = pack({ uuid: 'b2222222-2222-4222-8222-222222222222', version: '2.1.0-beta.1' })

    const plan = planReconcile({ desired: [second, first], observed: server() })

    expect(plan.activation.behavior).toEqual([
      { pack_id: second.uuid, version: '2.1.0-beta.1' },
      { pack_id: first.uuid, version: '1.0.0' },
    ])
  })

  // r-hpu39brj, d-4iepnry2 — each kind routed to its own pool and its own activation list
  it('routes each pack to the pool and list of the kind the pack set reports', () => {
    const behavior = pack()
    const resource = pack({ uuid: 'c3333333-3333-4333-8333-333333333333', kind: 'resource' })

    const plan = planReconcile({ desired: [behavior, resource], observed: server() })

    expect(plan.activation.behavior.map((e) => e.pack_id)).toEqual([behavior.uuid])
    expect(plan.activation.resource.map((e) => e.pack_id)).toEqual([resource.uuid])
  })

  // r-pcq10f2b — narrowing the selection removes the deselected pack and rewrites the list
  it('removes a deselected pack and rewrites the activation list', () => {
    const kept = pack()
    const dropped = pack({ uuid: 'b2222222-2222-4222-8222-222222222222' })
    const observed = settled([kept, dropped])

    const plan = planReconcile({ desired: [kept], observed })

    expect(plan.remove).toEqual([{ kind: 'behavior', uuid: dropped.uuid }])
    expect(plan.activation.behavior).toEqual([{ pack_id: kept.uuid, version: kept.version }])
    expect(plan.writeActivation).toBe(true)
  })

  // d-ftlfhac8 — a version change is an activation edit, so a restart
  it('restarts when a pack version changed', () => {
    const before = pack()
    const after = pack({ version: '1.1.0' })

    const plan = planReconcile({ desired: [after], observed: settled([before]) })

    expect(plan.apply).toBe('restart')
  })
})
