import { describe, expect, it } from 'vitest'
import { createPendingAuthStore } from './pending-auth.js'

describe('createPendingAuthStore', () => {
  it('round-trips an entry and returns it once (single-use)', () => {
    const store = createPendingAuthStore()
    store.put('s1', { pkceVerifier: 'v1', accountId: 7 })

    const first = store.consume('s1')
    expect(first).toMatchObject({ pkceVerifier: 'v1', accountId: 7 })

    // Replay: the same state is gone.
    expect(store.consume('s1')).toBeUndefined()
    expect(store.size()).toBe(0)
  })

  it('returns undefined for an unknown state', () => {
    const store = createPendingAuthStore()
    expect(store.consume('nope')).toBeUndefined()
  })

  it('rejects an expired entry on consume', () => {
    let clock = 1_000_000
    const store = createPendingAuthStore({
      ttlMs: 1000,
      now: () => clock,
    })
    store.put('s1', { pkceVerifier: 'v1' })

    clock += 1000 // exactly at TTL → expired
    expect(store.consume('s1')).toBeUndefined()
    // The expired entry is also removed.
    expect(store.size()).toBe(0)
  })

  it('keeps an entry that is still within TTL', () => {
    let clock = 0
    const store = createPendingAuthStore({ ttlMs: 1000, now: () => clock })
    store.put('s1', { pkceVerifier: 'v1' })
    clock = 999
    expect(store.consume('s1')).toMatchObject({ pkceVerifier: 'v1' })
  })

  it('prune drops only expired entries', () => {
    let clock = 0
    const store = createPendingAuthStore({ ttlMs: 1000, now: () => clock })
    store.put('old', { pkceVerifier: 'a' })
    clock = 1500
    store.put('new', { pkceVerifier: 'b' })
    store.prune()
    expect(store.size()).toBe(1)
    expect(store.consume('old')).toBeUndefined()
    expect(store.consume('new')).toMatchObject({ pkceVerifier: 'b' })
  })
})
