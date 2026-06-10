import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * The encryption seam the rest of the Daemon treats as opaque.
 *
 * The application "treats encryption as an opaque `encrypt(bytes) /
 * decrypt(bytes)` seam over a token-encryption key it receives at startup"
 * (oauth-flow.md "Encryption at rest"). S6 (Gmail OAuth token storage) consumes
 * this to protect `credentials.data_enc`. The seam neither generates nor
 * persists keys — the host supplies the key, and the daemon builds an
 * `Encryptor` from it via {@link makeEncryptor}.
 */
export interface Encryptor {
  /** Encrypt plaintext bytes; returns the self-contained ciphertext envelope. */
  encrypt(plaintext: Buffer): Buffer
  /** Decrypt a ciphertext envelope produced by {@link encrypt}; throws if the
   * authentication tag does not validate (tampering, wrong key, truncation). */
  decrypt(ciphertext: Buffer): Buffer
}

/** AES-256-GCM standard nonce length. */
const IV_BYTES = 12
/** AES-256-GCM authentication tag length. */
const TAG_BYTES = 16
/** AES-256 key length. */
const KEY_BYTES = 32

const ALGORITHM = 'aes-256-gcm'

/**
 * Build an {@link Encryptor} bound to a raw 32-byte key.
 *
 * Constructed as a factory so it is injectable and testable — the daemon builds
 * one from the configured `GRINBOX_TOKEN_ENC_KEY`; tests pass any 32-byte key.
 *
 * Envelope layout (a single self-describing buffer): `iv (12) || authTag (16)
 * || ciphertext`. A fresh random IV is generated per `encrypt` call. `decrypt`
 * splits the envelope, sets the tag, and lets `node:crypto` reject on
 * `final()` if the tag does not validate.
 */
export function makeEncryptor(key: Buffer): Encryptor {
  if (key.length !== KEY_BYTES) {
    throw new Error(`encryption key must be ${KEY_BYTES} bytes (got ${key.length})`)
  }

  return {
    encrypt(plaintext: Buffer): Buffer {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, iv)
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
      const authTag = cipher.getAuthTag()
      return Buffer.concat([iv, authTag, ciphertext])
    },

    decrypt(envelope: Buffer): Buffer {
      if (envelope.length < IV_BYTES + TAG_BYTES) {
        throw new Error('ciphertext is too short to contain IV + auth tag')
      }
      const iv = envelope.subarray(0, IV_BYTES)
      const authTag = envelope.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
      const ciphertext = envelope.subarray(IV_BYTES + TAG_BYTES)

      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)
      // `final()` throws if the tag fails to validate (tampering / wrong key).
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    },
  }
}
