import { describe, expect, it } from 'vitest'

import { foreignNamespaceClaims } from './claims.js'

// Its own file on purpose: module freshness is the runner's per-file boundary, so nothing here
// has emitted worldLoad and the claims module is still pre-load.
describe('foreignNamespaceClaims before world load', () => {
  // d-nqb3dtxv: an empty answer would read as "no rivals found", a claim the runtime cannot make
  // before the world-load enumeration — so the call throws, naming the boundary.
  it('throws, naming the boundary the report is built at', () => {
    expect(() => foreignNamespaceClaims()).toThrow(/before the world has loaded/)
    expect(() => foreignNamespaceClaims()).toThrow(/built at world load and does not exist yet/)
  })
})
