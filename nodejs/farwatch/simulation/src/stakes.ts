import type { Rng } from '@thrashplay/fw-core'

import type { Approach } from './approaches.js'
import { stakesConfig } from './config.js'
import { pickWeighted, type ResourceDelta } from './resources.js'

/**
 * The stake a trial carries — what its failure would cost — or `undefined` for the many trials
 * whose failure costs nothing lasting. Kind and tier come from the editable `stakes.yaml` tables;
 * applied to the ledger only if the trial actually fails.
 */
export const generateStake = (rng: Rng, approach: Approach): ResourceDelta | undefined => {
  const cfg = stakesConfig()
  if (rng.next() >= cfg.stakeChance) {
    return undefined
  }
  const kinds = cfg.stakeKinds[approach]
  if (!kinds) {
    return undefined
  }
  return { kind: pickWeighted(rng, kinds), tier: pickWeighted(rng, cfg.stakeTierWeights) }
}
