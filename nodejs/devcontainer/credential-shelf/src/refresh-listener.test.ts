import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createRefreshHandler, createRefreshServer, parseDevicePrompt } from './refresh-listener.js'
import type { LoginRun, LoginRunner, RefreshHandler } from './refresh-listener.js'
import type { VendConfig } from './types.js'

const awsSsoCfg = (session = 'sso'): VendConfig => ({
  providers: [
    {
      kind: 'aws-sso',
      startUrl: 'https://d-x.awsapps.com/start/',
      region: 'us-east-1',
      session,
      grants: [{ name: 'dev', accountId: '0848', role: 'developer-ai-agent', region: 'us-east-1' }],
    },
  ],
})

/** A deferred whose completion we resolve from the test to simulate operator approval. */
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('parseDevicePrompt', () => {
  it('pulls the URL + code out of --no-browser output', () => {
    const output = [
      'Attempting to automatically open the SSO authorization page in your default browser.',
      'If the browser does not open, open the following URL:',
      '',
      'https://device.sso.us-east-1.amazonaws.com/',
      '',
      'Then enter the code:',
      '',
      'WXYZ-1234',
    ].join('\n')
    expect(parseDevicePrompt(output)).toEqual({
      userCode: 'WXYZ-1234',
      verificationUri: 'https://device.sso.us-east-1.amazonaws.com/',
    })
  })

  it('prefers the plain URL and also surfaces the completion URL', () => {
    const output =
      'open https://device.sso.us-east-1.amazonaws.com/ or\n' +
      'https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH\ncode: ABCD-EFGH\n'
    expect(parseDevicePrompt(output)).toEqual({
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://device.sso.us-east-1.amazonaws.com/',
      verificationUriComplete: 'https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH',
    })
  })

  it('returns null until both URL and code are present', () => {
    expect(parseDevicePrompt('Attempting to open the browser…')).toBeNull()
    expect(parseDevicePrompt('https://device.sso.example/ but no code yet')).toBeNull()
  })
})

describe('createRefreshHandler', () => {
  it('vends once every session login is approved', async () => {
    const approval = deferred()
    const runner: LoginRunner = vi.fn(
      (session): LoginRun => ({
        prompt: Promise.resolve({ session, userCode: 'WXYZ-1234', verificationUri: 'https://device.sso/' }),
        completed: approval.promise,
      }),
    )
    const vend = vi.fn().mockResolvedValue(undefined)
    const handler = createRefreshHandler(awsSsoCfg(), { loginRunner: runner, vend, vendProfiles: ['dev'] })

    const prompts = await handler.triggerRefresh()
    expect(prompts).toEqual([{ session: 'sso', userCode: 'WXYZ-1234', verificationUri: 'https://device.sso/' }])
    expect(handler.status().refresh_pending).toBe(true)
    expect(vend).not.toHaveBeenCalled()

    approval.resolve()
    await vi.waitFor(() => {
      expect(vend).toHaveBeenCalledWith(['dev'])
    })
    await vi.waitFor(() => {
      expect(handler.status().refresh_pending).toBe(false)
    })
  })

  it('is single-flight: a second trigger reuses the pending login', async () => {
    const approval = deferred()
    const runner: LoginRunner = vi.fn(
      (session): LoginRun => ({
        prompt: Promise.resolve({ session, userCode: 'WXYZ-1234', verificationUri: 'https://device.sso/' }),
        completed: approval.promise,
      }),
    )
    const handler = createRefreshHandler(awsSsoCfg(), { loginRunner: runner, vend: vi.fn(), vendProfiles: [] })

    const first = await handler.triggerRefresh()
    const second = await handler.triggerRefresh()
    expect(second).toEqual(first)
    expect(runner).toHaveBeenCalledTimes(1) // one session, started once — not twice
  })

  it('rejects when no aws-sso providers are configured', async () => {
    const handler = createRefreshHandler({ providers: [] }, { vendProfiles: [], vend: vi.fn() })
    await expect(handler.triggerRefresh()).rejects.toThrow(/no aws-sso providers/)
  })

  it('reports session + credential expiry via status', () => {
    const handler = createRefreshHandler(awsSsoCfg(), {
      vendProfiles: [],
      vend: vi.fn(),
      sessionExpiry: () => '2026-07-01T20:00:00Z',
    })
    const status = handler.status()
    expect(status.sessions).toEqual(['sso'])
    expect(status.session_expires_at).toBe('2026-07-01T20:00:00Z')
    expect(status.refresh_pending).toBe(false)
  })
})

describe('the socket server', () => {
  const stubHandler = (over: Partial<RefreshHandler> = {}): RefreshHandler => ({
    triggerRefresh: () =>
      Promise.resolve([{ session: 'sso', userCode: 'WXYZ-1234', verificationUri: 'https://device.sso/' }]),
    status: () => ({
      sessions: ['sso'],
      session_expires_at: null,
      credentials_expire_at: null,
      refresh_pending: false,
    }),
    ...over,
  })

  const call = (socketPath: string, method: string, path: string): Promise<{ status: number; body: unknown }> =>
    new Promise((resolve, reject) => {
      const req = request({ socketPath, method, path }, (res) => {
        let data = ''
        res.on('data', (c: Buffer) => {
          data += c.toString()
        })
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: data.length > 0 ? JSON.parse(data) : undefined })
        })
      })
      req.on('error', reject)
      req.end()
    })

  it('serves POST /refresh and GET /status; 404s the rest', async () => {
    const server = createRefreshServer(stubHandler())
    const socketPath = join(
      tmpdir(),
      `refresh-test-${process.pid.toString()}-${process.hrtime.bigint().toString()}.sock`,
    )
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      const refresh = await call(socketPath, 'POST', '/refresh')
      expect(refresh.status).toBe(200)
      expect(refresh.body).toEqual({
        prompts: [{ session: 'sso', user_code: 'WXYZ-1234', verification_uri: 'https://device.sso/' }],
      })

      const status = await call(socketPath, 'GET', '/status')
      expect(status.status).toBe(200)

      const missing = await call(socketPath, 'GET', '/nope')
      expect(missing.status).toBe(404)

      // The primitive takes no arguments — GET /refresh is not the trigger.
      const wrongMethod = await call(socketPath, 'GET', '/refresh')
      expect(wrongMethod.status).toBe(404)
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    }
  })
})
