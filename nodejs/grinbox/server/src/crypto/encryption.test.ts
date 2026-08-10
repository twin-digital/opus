import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { makeEncryptor } from './encryption.js'

const KEY = randomBytes(32)

describe('makeEncryptor', () => {
  it('round-trips: decrypt(encrypt(x)) === x', () => {
    const { encrypt, decrypt } = makeEncryptor(KEY)
    const plaintext = Buffer.from('a Gmail refresh token, opaque to us', 'utf8')
    const restored = decrypt(encrypt(plaintext))
    expect(restored.equals(plaintext)).toBe(true)
  })

  it('round-trips empty and binary payloads', () => {
    const { encrypt, decrypt } = makeEncryptor(KEY)
    for (const pt of [Buffer.alloc(0), randomBytes(4096)]) {
      expect(decrypt(encrypt(pt)).equals(pt)).toBe(true)
    }
  })

  it('produces a fresh IV per call (distinct ciphertexts for same input)', () => {
    const { encrypt } = makeEncryptor(KEY)
    const pt = Buffer.from('same input')
    expect(encrypt(pt).equals(encrypt(pt))).toBe(false)
  })

  it('uses the iv || authTag || ciphertext envelope layout', () => {
    const { encrypt } = makeEncryptor(KEY)
    const pt = Buffer.from('hello')
    const env = encrypt(pt)
    // 12 (IV) + 16 (tag) + len(ciphertext == plaintext for a stream cipher)
    expect(env.length).toBe(12 + 16 + pt.length)
  })

  it('rejects a tampered ciphertext body', () => {
    const { encrypt, decrypt } = makeEncryptor(KEY)
    const env = encrypt(Buffer.from('do not tamper'))
    const last = env.length - 1
    env[last] = (env[last] ?? 0) ^ 0xff // flip a bit in the ciphertext
    expect(() => decrypt(env)).toThrow()
  })

  it('rejects a tampered auth tag', () => {
    const { encrypt, decrypt } = makeEncryptor(KEY)
    const env = encrypt(Buffer.from('integrity matters'))
    env[12] = env[12] ^ 0xff // first byte of the tag
    expect(() => decrypt(env)).toThrow()
  })

  it('rejects decryption under a different key', () => {
    const env = makeEncryptor(KEY).encrypt(Buffer.from('secret'))
    const other = makeEncryptor(randomBytes(32))
    expect(() => other.decrypt(env)).toThrow()
  })

  it('rejects an envelope too short to hold IV + tag', () => {
    const { decrypt } = makeEncryptor(KEY)
    expect(() => decrypt(Buffer.alloc(10))).toThrow(/too short/i)
  })

  it('throws when constructed with a wrong-length key', () => {
    expect(() => makeEncryptor(randomBytes(16))).toThrow(/32 bytes/)
  })
})
