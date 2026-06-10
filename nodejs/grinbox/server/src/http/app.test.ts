import { randomBytes } from 'node:crypto'
import { healthSchema } from '@twin-digital/grinbox-shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TOKEN_ENC_KEY_ENV, loadConfig } from '../config.js'
import { makeEncryptor } from '../crypto/encryption.js'
import { type DB, closeDatabase, openDatabase, runMigrations } from '../db/index.js'
import { version } from '../version.js'
import { createApp } from './app.js'

/**
 * Bootstrap-shaped acceptance test (build-plan.md "First check-in: Tier 0
 * green"): open a temp (in-memory) DB, run migrations, build the encryptor, mount
 * the app, and hit `/healthz` via Hono's request client — no real socket.
 */
describe('createApp /healthz', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('responds 200 with the health body and version', async () => {
    const config = loadConfig({
      [TOKEN_ENC_KEY_ENV]: randomBytes(32).toString('base64'),
    })
    const encryptor = makeEncryptor(config.tokenEncKey)
    const app = createApp({ db, config, encryptor, version })

    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok', version })
  })

  it('serves a /healthz body that parses against the shared healthSchema', async () => {
    const config = loadConfig({
      [TOKEN_ENC_KEY_ENV]: randomBytes(32).toString('base64'),
    })
    const encryptor = makeEncryptor(config.tokenEncKey)
    const app = createApp({ db, config, encryptor, version })

    const res = await app.request('/healthz')
    const parsed = healthSchema.safeParse(await res.json())
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.version).toBe(version)
    }
  })
})
