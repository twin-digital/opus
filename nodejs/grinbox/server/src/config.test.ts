import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TOKEN_ENC_KEY_ENV, loadConfig } from './config.js'

/** A valid 32-byte key, base64-encoded. */
const VALID_KEY_B64 = randomBytes(32).toString('base64')
const VALID_KEY_HEX = randomBytes(32).toString('hex')

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { [TOKEN_ENC_KEY_ENV]: VALID_KEY_B64, ...overrides }
}

describe('loadConfig', () => {
  it('accepts a valid base64 key and applies defaults', () => {
    const cfg = loadConfig(envWith({}))
    expect(cfg.tokenEncKey).toBeInstanceOf(Buffer)
    expect(cfg.tokenEncKey.length).toBe(32)
    expect(cfg.dbPath).toBe('./grinbox.db')
    expect(cfg.httpPort).toBe(8787)
    expect(cfg.httpHost).toBe('0.0.0.0')
    expect(cfg.oauthClientId).toBeUndefined()
  })

  it('accepts a hex-encoded key', () => {
    const cfg = loadConfig(envWith({ [TOKEN_ENC_KEY_ENV]: VALID_KEY_HEX }))
    expect(cfg.tokenEncKey.length).toBe(32)
  })

  it('honors overrides for db path / host / port', () => {
    const cfg = loadConfig(
      envWith({
        GRINBOX_DB_PATH: '/data/grinbox.db',
        GRINBOX_HTTP_HOST: '127.0.0.1',
        GRINBOX_HTTP_PORT: '9000',
      }),
    )
    expect(cfg.dbPath).toBe('/data/grinbox.db')
    expect(cfg.httpHost).toBe('127.0.0.1')
    expect(cfg.httpPort).toBe(9000)
  })

  it('carries optional later-task fields when present', () => {
    const cfg = loadConfig(
      envWith({
        GRINBOX_OAUTH_CLIENT_ID: 'cid',
        GRINBOX_OAUTH_CLIENT_SECRET: 'csecret',
        GRINBOX_BEDROCK_REGION: 'us-east-1',
      }),
    )
    expect(cfg.oauthClientId).toBe('cid')
    expect(cfg.oauthClientSecret).toBe('csecret')
    expect(cfg.bedrockRegion).toBe('us-east-1')
  })

  it('rejects a missing key', () => {
    expect(() => loadConfig({})).toThrow(new RegExp(TOKEN_ENC_KEY_ENV))
  })

  it('rejects a key of the wrong length', () => {
    const shortKey = randomBytes(16).toString('base64')
    expect(() => loadConfig(envWith({ [TOKEN_ENC_KEY_ENV]: shortKey }))).toThrow(/32 bytes/)
  })

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig(envWith({ GRINBOX_HTTP_PORT: '99999' }))).toThrow(/Invalid Grinbox configuration/)
  })

  it('rejects a port below the lower bound', () => {
    expect(() => loadConfig(envWith({ GRINBOX_HTTP_PORT: '0' }))).toThrow(/Invalid Grinbox configuration/)
    expect(() => loadConfig(envWith({ GRINBOX_HTTP_PORT: '-1' }))).toThrow(/Invalid Grinbox configuration/)
  })

  it('applies engine-field defaults', () => {
    const cfg = loadConfig(envWith({}))
    expect(cfg.operatorTimeoutMs).toBe(30_000)
    expect(cfg.workerPoolSize).toBe(3)
    expect(cfg.pollSchedulerTickSeconds).toBe(60)
  })

  it('coerces engine fields from their env strings', () => {
    const cfg = loadConfig(
      envWith({
        GRINBOX_OPERATOR_TIMEOUT_MS: '5000',
        GRINBOX_WORKER_POOL_SIZE: '8',
        GRINBOX_POLL_SCHEDULER_TICK_SECONDS: '15',
      }),
    )
    expect(cfg.operatorTimeoutMs).toBe(5000)
    expect(cfg.workerPoolSize).toBe(8)
    expect(cfg.pollSchedulerTickSeconds).toBe(15)
  })

  it('rejects a non-positive operatorTimeoutMs', () => {
    expect(() => loadConfig(envWith({ GRINBOX_OPERATOR_TIMEOUT_MS: '0' }))).toThrow(/Invalid Grinbox configuration/)
    expect(() => loadConfig(envWith({ GRINBOX_OPERATOR_TIMEOUT_MS: '-1' }))).toThrow(/Invalid Grinbox configuration/)
  })

  it('rejects a non-positive workerPoolSize', () => {
    expect(() => loadConfig(envWith({ GRINBOX_WORKER_POOL_SIZE: '0' }))).toThrow(/Invalid Grinbox configuration/)
  })

  it('rejects a non-positive pollSchedulerTickSeconds', () => {
    expect(() => loadConfig(envWith({ GRINBOX_POLL_SCHEDULER_TICK_SECONDS: '-5' }))).toThrow(
      /Invalid Grinbox configuration/,
    )
  })

  it('rejects an undecodable key with the base64/hex message (distinct from wrong-length)', () => {
    // '===' is non-empty but decodes to a zero-length buffer in base64, so
    // decodeKey returns null -> the "must be a base64- or hex-encoded" message,
    // NOT the "must decode to exactly 32 bytes" message.
    expect(() => loadConfig(envWith({ [TOKEN_ENC_KEY_ENV]: '===' }))).toThrow(/base64- or hex-encoded/)
    expect(() => loadConfig(envWith({ [TOKEN_ENC_KEY_ENV]: '===' }))).not.toThrow(/decode to exactly/)
  })
})
