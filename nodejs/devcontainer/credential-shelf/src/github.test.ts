import { describe, expect, it } from 'vitest'

import { jwtSigningInput, tokenRequestBody } from './github.js'

const decodeSegment = (seg: string): unknown => JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))

describe('jwtSigningInput', () => {
  it('builds a base64url header.payload with RS256 and the App-id claims', () => {
    const now = 1_750_000_000
    const input = jwtSigningInput('3967552', now)
    const [header, payload] = input.split('.')
    expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decodeSegment(payload)).toEqual({ iat: now - 60, exp: now + 480, iss: '3967552' })
    // base64url: no '+', '/', or '=' padding
    expect(input).not.toMatch(/[+/=]/)
  })
})

describe('tokenRequestBody', () => {
  it('includes only the scoping fields that are set', () => {
    expect(tokenRequestBody({ name: 'o', installationId: '1' })).toEqual({})
    expect(tokenRequestBody({ name: 'o', installationId: '1', repos: ['a', 'b'] })).toEqual({
      repositories: ['a', 'b'],
    })
    expect(tokenRequestBody({ name: 'o', installationId: '1', perms: { contents: 'read' } })).toEqual({
      permissions: { contents: 'read' },
    })
  })
})
