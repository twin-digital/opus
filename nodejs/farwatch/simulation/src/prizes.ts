import type { Rng } from '@thrashplay/fw-core'

import { prizesConfig } from './config.js'
import { isNonfungible, pickWeighted, type ResourceDelta } from './resources.js'

/**
 * The prize a trial carries — the boon won on success — or `undefined` for the many trials that
 * yield nothing extra. Kind is drawn from a general weighted table (a prize reflects what was there
 * to win, not how it was won), so it can be any resource kind; applied to the ledger only if the
 * trial actually succeeds.
 */
export const generatePrize = (rng: Rng): ResourceDelta | undefined => {
  const cfg = prizesConfig()
  if (rng.next() >= cfg.prizeChance) {
    return undefined
  }
  const kind = pickWeighted(rng, cfg.prizeKindWeights)
  return isNonfungible(kind) ? { kind } : { kind, tier: pickWeighted(rng, cfg.prizeTierWeights) }
}
