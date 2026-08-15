import { world } from '@minecraft/server'
import { currentServer, emit, registerEntityType } from '@twin-digital/minecraft-test-lib'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { foreignNamespaceClaims } from './claims.js'
import type { PackRuntimeInjection } from './injection.js'

const host = globalThis as { __MC_PACK_RUNTIME__?: PackRuntimeInjection }

const inject = (namespace: string, packToken: string): void => {
  host.__MC_PACK_RUNTIME__ = { namespace, packToken, prefixes: [] }
}

// console.warn is the script engine's write to the content log, so the log is read off a spy.
let contentLog: MockInstance<Console['warn']>

beforeEach(() => {
  contentLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  contentLog.mockRestore()
  delete host.__MC_PACK_RUNTIME__
})

/** Drives the load the fakes never raise themselves; claims.ts enumerated by the time this returns. */
const loadWorld = (): void => {
  emit(world.afterEvents.worldLoad, {})
}

// d-q7mz2qb0: at load the runtime enumerates the declared entity types and exposes the foreign
// claims it finds in the pack's namespace. A test registers claim types via the test lib's
// `registerEntityType` — e.g. its own `arena:mcdk_claim_acme-arena` beside a rival's
// `arena:mcdk_claim_bob-arena` — and reads the content log back off the console.warn spy.
describe('foreignNamespaceClaims', () => {
  it("exposes a claim in the pack's namespace carrying another pack's token", () => {
    inject('arena', 'acme-arena')
    registerEntityType(currentServer(), 'arena:mcdk_claim_acme-arena')
    registerEntityType(currentServer(), 'arena:mcdk_claim_bob-arena')
    loadWorld()
    expect(foreignNamespaceClaims()).toEqual([
      { namespace: 'arena', token: 'bob-arena', entityTypeId: 'arena:mcdk_claim_bob-arena' },
    ])
  })

  it('writes the contention to the content log', () => {
    inject('keep', 'acme-keep')
    registerEntityType(currentServer(), 'keep:mcdk_claim_acme-keep')
    registerEntityType(currentServer(), 'keep:mcdk_claim_bob-keep')
    loadWorld()
    expect(contentLog).toHaveBeenCalledTimes(1)
    expect(contentLog).toHaveBeenCalledWith(
      "[mc-pack-runtime] namespace 'keep' is also claimed by pack 'bob-keep' (keep:mcdk_claim_bob-keep)",
    )
  })

  it("answers empty and logs nothing where only the pack's own claim stands", () => {
    inject('solo', 'acme-solo')
    registerEntityType(currentServer(), 'solo:mcdk_claim_acme-solo')
    loadWorld()
    expect(foreignNamespaceClaims()).toEqual([])
    expect(contentLog).not.toHaveBeenCalled()
  })

  it('ignores claim types in other namespaces, and non-claim types in its own', () => {
    inject('zone', 'acme-zone')
    registerEntityType(currentServer(), 'zone:mcdk_claim_acme-zone')
    registerEntityType(currentServer(), 'elsewhere:mcdk_claim_bob-elsewhere')
    registerEntityType(currentServer(), 'zone:guard_post')
    loadWorld()
    expect(foreignNamespaceClaims()).toEqual([])
    expect(contentLog).not.toHaveBeenCalled()
  })

  it('answers empty and logs nothing where no namespace was injected', () => {
    registerEntityType(currentServer(), 'nons:mcdk_claim_somebody-else')
    loadWorld()
    expect(foreignNamespaceClaims()).toEqual([])
    expect(contentLog).not.toHaveBeenCalled()
  })
})
