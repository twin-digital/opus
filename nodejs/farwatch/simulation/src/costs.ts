import type { Approach } from './approaches.js'
import { costsConfig } from './config.js'
import type { ResourceDelta } from './resources.js'

/**
 * The upfront cost of attempting a trial with this approach — paid win or lose — or `undefined` for
 * the many approaches that cost nothing to attempt. Fixed per approach (no roll); only the few
 * pre-paying approaches (`wealth` lays down coin, `sacrifice` gives something up) carry one.
 */
export const generateCost = (approach: Approach): ResourceDelta | undefined => {
  const cost = costsConfig().costs[approach]
  return cost ? { kind: cost.kind, tier: cost.tier } : undefined
}
