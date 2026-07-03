import { describe, expect, it } from 'vitest'

import { loadTriggerConfig } from './config.js'

describe('loadTriggerConfig', () => {
  it('applies defaults with only a token set', () => {
    const cfg = loadTriggerConfig({ TRIGGER_TOKEN: 's3cret' })
    expect(cfg).toEqual({
      host: '0.0.0.0',
      port: 8770,
      token: 's3cret',
      upstreamSocket: '/run/credential-shelf/refresh.sock',
      rateLimitIntervalSec: 30,
      rateLimitBurst: 1,
    })
  })

  it('fails closed when the token is absent', () => {
    expect(() => loadTriggerConfig({})).toThrow(/TRIGGER_TOKEN is required/)
  })

  it('parses host:port, a bare port, and overrides', () => {
    expect(loadTriggerConfig({ TRIGGER_TOKEN: 't', TRIGGER_LISTEN: '127.0.0.1:9000' })).toMatchObject({
      host: '127.0.0.1',
      port: 9000,
    })
    expect(loadTriggerConfig({ TRIGGER_TOKEN: 't', TRIGGER_LISTEN: '9001' })).toMatchObject({
      host: '0.0.0.0',
      port: 9001,
    })
    expect(
      loadTriggerConfig({
        TRIGGER_TOKEN: 't',
        TRIGGER_UPSTREAM_SOCKET: '/tmp/x.sock',
        TRIGGER_RATE_LIMIT_INTERVAL_SEC: '10',
        TRIGGER_RATE_LIMIT_BURST: '5',
      }),
    ).toMatchObject({ upstreamSocket: '/tmp/x.sock', rateLimitIntervalSec: 10, rateLimitBurst: 5 })
  })

  it('rejects invalid numeric config', () => {
    expect(() => loadTriggerConfig({ TRIGGER_TOKEN: 't', TRIGGER_RATE_LIMIT_INTERVAL_SEC: '-1' })).toThrow(
      /positive number/,
    )
    expect(() => loadTriggerConfig({ TRIGGER_TOKEN: 't', TRIGGER_LISTEN: 'host:notaport' })).toThrow(/invalid port/)
  })
})
