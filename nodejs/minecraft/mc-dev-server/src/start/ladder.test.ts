import { describe, expect, it } from 'vitest'

import { decideStartAction } from './ladder.js'

import type { DesiredServer, RunningServer } from './ladder.js'

const desired = (overrides: Partial<DesiredServer> = {}): DesiredServer => ({
  image: 'itzg/minecraft-bedrock-server:latest',
  port: 19132,
  ...overrides,
})

const running = (overrides: Partial<RunningServer> = {}): RunningServer => ({
  level: 'dev',
  image: 'itzg/minecraft-bedrock-server:latest',
  port: 19132,
  worlds: ['dev'],
  seeds: { dev: 424242n },
  ...overrides,
})

describe('decideStartAction', () => {
  // d-ifke5eeh — nothing running, so the project comes up
  it('starts when nothing is running', () => {
    expect(decideStartAction(desired({ level: 'dev' }))).toEqual({ kind: 'start', level: 'dev', generate: true })
  })

  // d-wkcxcv2b — the level a run generates when nothing names one
  it('starts the default world when no level is named', () => {
    expect(decideStartAction(desired())).toEqual({ kind: 'start', level: 'default', generate: true })
  })

  // d-owprl7uy rung 1, d-ifke5eeh — every specified setting matches
  it('attaches when everything specified matches', () => {
    expect(decideStartAction(desired({ level: 'dev', seed: 424242n }), running())).toEqual({ kind: 'attach' })
  })

  // d-41m3iws5 — an unspecified setting is a wildcard, not a demand
  it('attaches when the run names neither level nor seed', () => {
    expect(decideStartAction(desired(), running())).toEqual({ kind: 'attach' })
  })

  // d-owprl7uy rung 2, d-5vjxmr4u — switching to a world the volume already holds
  it('recreates onto a world the volume holds', () => {
    const action = decideStartAction(desired({ level: 'other' }), running({ worlds: ['dev', 'other'] }))

    expect(action).toMatchObject({ kind: 'recreate', level: 'other', generate: false })
  })

  // d-owprl7uy rung 3 — the volume does not hold that world
  it('generates a world the volume does not hold', () => {
    const action = decideStartAction(desired({ level: 'fresh' }), running())

    expect(action).toMatchObject({ kind: 'recreate', level: 'fresh', generate: true })
  })

  // d-owprl7uy rung 4 — only the image or port differs
  it('recreates when the image changed', () => {
    const action = decideStartAction(desired({ image: 'itzg/minecraft-bedrock-server:1.21' }), running())

    expect(action).toMatchObject({ kind: 'recreate', generate: false })
  })

  it('recreates when the published port changed', () => {
    expect(decideStartAction(desired({ port: 19140 }), running())).toMatchObject({ kind: 'recreate' })
  })

  // d-owprl7uy rung 5 — the only destructive rung
  it('asks before regenerating a world whose seed does not match', () => {
    const action = decideStartAction(desired({ level: 'dev', seed: 999111n }), running())

    expect(action).toEqual({
      kind: 'confirm-regenerate',
      level: 'dev',
      requestedSeed: 999111n,
      recordedSeed: 424242n,
    })
  })

  // d-5ocyva9w — a world with no seed on record matches nothing
  it('asks when the world has no seed on record', () => {
    const action = decideStartAction(desired({ level: 'dev', seed: 1n }), running({ seeds: {} }))

    expect(action).toEqual({ kind: 'confirm-regenerate', level: 'dev', requestedSeed: 1n })
  })
})
