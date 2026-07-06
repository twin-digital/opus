import { describe, it, expect } from 'vitest'

import { GoalsConfig, goalsConfig, stakesConfig } from './config.js'

describe('config', () => {
  it('loads and validates the real goals.yaml', () => {
    const cfg = goalsConfig()
    expect(cfg.inviableChance).toBeGreaterThanOrEqual(0)
    expect(cfg.rewardKindWeights.item).toBeGreaterThan(0)
  })

  it('loads and validates the real stakes.yaml', () => {
    const cfg = stakesConfig()
    expect(cfg.stakeChance).toBeGreaterThan(0)
    expect(cfg.stakeKinds.combat?.vigor).toBeGreaterThan(0)
  })

  it('rejects out-of-range or mistyped config', () => {
    expect(() => GoalsConfig.parse({ rewardKindWeights: {}, rewardTierWeights: {}, inviableChance: 2 })).toThrow()
    expect(() =>
      GoalsConfig.parse({ rewardKindWeights: { bogus: 1 }, rewardTierWeights: {}, inviableChance: 0.1 }),
    ).toThrow()
  })
})
