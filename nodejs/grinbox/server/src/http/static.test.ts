import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Config, TOKEN_ENC_KEY_ENV, loadConfig } from '../config.js'
import { makeEncryptor } from '../crypto/encryption.js'
import { type DB, closeDatabase, openDatabase, runMigrations } from '../db/index.js'
import { version } from '../version.js'
import { createApp } from './app.js'
import { resolveWebDistPath } from './static.js'

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>'
const APP_JS = 'console.log("grinbox spa")'

/**
 * Build a config whose `webDistPath` points at a caller-supplied dir, so the
 * static layer can be exercised against a temp build (or a missing path) without
 * depending on whether `packages/web/dist` happens to exist.
 */
function makeConfig(webDistPath: string): Config {
  return loadConfig({
    [TOKEN_ENC_KEY_ENV]: 'a'.repeat(64), // 32 bytes hex
    GRINBOX_WEB_DIST: webDistPath,
  })
}

describe('static SPA serving', () => {
  let db: DB
  let distDir: string

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
    distDir = mkdtempSync(join(tmpdir(), 'grinbox-web-dist-'))
    mkdirSync(join(distDir, 'assets'))
    writeFileSync(join(distDir, 'index.html'), INDEX_HTML)
    writeFileSync(join(distDir, 'assets', 'app.js'), APP_JS)
  })

  afterEach(async () => {
    await closeDatabase(db)
    rmSync(distDir, { recursive: true, force: true })
  })

  function buildApp(webDistPath: string) {
    const config = makeConfig(webDistPath)
    const encryptor = makeEncryptor(config.tokenEncKey)
    return createApp({ db, config, encryptor, version })
  }

  it('serves a real static asset', async () => {
    const app = buildApp(distDir)
    const res = await app.request('/assets/app.js')
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(APP_JS)
  })

  it('returns index.html for an unknown client route (SPA fallback)', async () => {
    const app = buildApp(distDir)
    const res = await app.request('/inbox/123')
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(INDEX_HTML)
  })

  it('still serves /healthz when the web build is present', async () => {
    const app = buildApp(distDir)
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok', version })
  })

  it('keeps the API JSON 404 for an unknown /api path (not the SPA index)', async () => {
    const app = buildApp(distDir)
    const res = await app.request('/api/this-route-does-not-exist')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).not.toBe(INDEX_HTML)
  })

  it('builds and serves the API when the web build is absent', async () => {
    const missing = join(distDir, 'does-not-exist')
    const app = buildApp(missing)

    const health = await app.request('/healthz')
    expect(health.status).toBe(200)

    // No static fallback: an unknown non-API GET 404s rather than returning HTML.
    const spa = await app.request('/inbox/123')
    expect(spa.status).toBe(404)
    await expect(spa.text()).resolves.not.toBe(INDEX_HTML)
  })
})

describe('resolveWebDistPath', () => {
  it('resolves the sibling web/dist path when no path is configured', () => {
    // The default branch (configuredPath === '') points at the compiled
    // server's sibling `web/dist`.
    const resolved = resolveWebDistPath('')
    expect(resolved.replace(/\\/g, '/').endsWith('/web/dist')).toBe(true)
    expect(isAbsolute(resolved)).toBe(true)
  })

  it('resolves a relative configured path against cwd', () => {
    const resolved = resolveWebDistPath('some/rel/dir')
    expect(isAbsolute(resolved)).toBe(true)
    expect(resolved.replace(/\\/g, '/').endsWith('/some/rel/dir')).toBe(true)
  })

  it('returns an absolute configured path unchanged', () => {
    const abs = resolve('/tmp/grinbox-dist')
    expect(resolveWebDistPath(abs)).toBe(abs)
  })
})
