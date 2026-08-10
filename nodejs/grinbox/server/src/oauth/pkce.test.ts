import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generatePkcePair, generateState } from './pkce.js'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('generatePkcePair', () => {
  it('produces a URL-safe verifier and the matching S256 challenge', () => {
    const { verifier, challenge } = generatePkcePair()
    // RFC 7636 verifier length bounds (43..128 chars) and URL-safe alphabet.
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)

    const expected = base64url(createHash('sha256').update(verifier).digest())
    expect(challenge).toBe(expected)
  })

  it('generates distinct verifiers across calls', () => {
    expect(generatePkcePair().verifier).not.toBe(generatePkcePair().verifier)
  })
})

describe('generateState', () => {
  it('produces a URL-safe high-entropy token', () => {
    const state = generateState()
    expect(state).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(state.length).toBeGreaterThanOrEqual(43)
  })

  it('is distinct across calls', () => {
    expect(generateState()).not.toBe(generateState())
  })
})
