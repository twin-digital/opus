/**
 * PKCE + `state` primitives for the OAuth flow (oauth-flow.md "The flow"). PKCE
 * is used even though this is a confidential client — cheap defense-in-depth
 * against interception of the authorization code during the popup redirect.
 */

import { createHash, randomBytes } from 'node:crypto'

/** A generated PKCE pair: the secret verifier and its S256 challenge. */
export interface PkcePair {
  /** The high-entropy secret kept server-side in the pending-auth store. */
  readonly verifier: string
  /** base64url(SHA-256(verifier)) — sent to Google as `code_challenge`. */
  readonly challenge: string
}

/** base64url-encode a buffer (RFC 7636: no padding, URL-safe alphabet). */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate a PKCE verifier/challenge pair. The verifier is 32 random bytes
 * base64url-encoded (well within RFC 7636's 43–128 character range); the
 * challenge is the S256 transform.
 */
export function generatePkcePair(): PkcePair {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/**
 * Generate a single-use, opaque `state` token. 32 random bytes base64url-encoded
 * — the CSRF defense and correlation key between `/oauth/start` (internal) and
 * `/oauth/callback` (public).
 */
export function generateState(): string {
  return base64url(randomBytes(32))
}
