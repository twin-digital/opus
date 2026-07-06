import { timingSafeEqual } from 'node:crypto'

/** Extract the token from an `Authorization: Bearer <token>` header. */
export const bearerToken = (authHeader: string | undefined): string | undefined => {
  if (authHeader === undefined) {
    return undefined
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return match?.[1]
}

/** Constant-time compare of a presented token against the expected secret. */
export const tokenMatches = (provided: string | undefined, expected: string): boolean => {
  if (provided === undefined) {
    return false
  }
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual requires equal lengths; a length mismatch is already a non-match.
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

/** Whether a request's Authorization header carries the expected shared token. */
export const isAuthorized = (authHeader: string | undefined, expected: string): boolean =>
  tokenMatches(bearerToken(authHeader), expected)
