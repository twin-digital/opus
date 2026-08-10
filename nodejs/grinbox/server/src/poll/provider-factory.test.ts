import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PollableAccount } from './poll-cycle.js'
import { productionProviderFactory } from './provider-factory.js'

/**
 * Direct test of the production {@link ProviderFactory}. Everywhere else the
 * scheduler's null-skip path is exercised through an injected `() => null`; this
 * imports the real factory and asserts its documented null-until-auth behavior
 * (it has no credential resolver wired in, so every Account resolves to `null`).
 */

describe('productionProviderFactory', () => {
  beforeEach(() => {
    // Silence the informational "no provider configured" log the factory emits.
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function account(id: number): PollableAccount {
    return {
      id,
      providerType: 'gmail',
      activePipelineId: 1,
      settingsJson: JSON.stringify({ email: 'u@example.com' }),
      lastHistoryCursor: null,
      lastPolledAt: null,
      lastReconciledAt: null,
    }
  }

  it('returns null for every Account (no credential resolver wired in yet)', () => {
    const factory = productionProviderFactory()
    expect(factory(account(1))).toBeNull()
    expect(factory(account(2))).toBeNull()
  })

  it('logs the needs-auth skip reason with the account id', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const factory = productionProviderFactory()
    factory(account(42))
    expect(info).toHaveBeenCalledWith(expect.stringContaining('account=42'))
  })
})
