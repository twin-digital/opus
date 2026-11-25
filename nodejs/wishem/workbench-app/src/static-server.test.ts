// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, '..', 'scripts', 'static-server.js')

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('no port'))
        }
      })
    })
  })

const get = (port: number, path: string) =>
  new Promise<{ status: number; type: string | undefined }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      res.resume()
      resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'] })
    })
    req.on('error', reject)
    req.end()
  })

describe('static-server.js', () => {
  let outer = ''
  let child: ChildProcess | undefined
  let port = 0

  beforeAll(async () => {
    outer = mkdtempSync(join(tmpdir(), 'workbench-static-'))
    const site = join(outer, 'site')
    mkdirSync(site)
    writeFileSync(join(site, 'a.js'), 'export {}')
    writeFileSync(join(site, 'f.woff2'), 'font')
    writeFileSync(join(outer, 'secret.txt'), 'secret')
    port = await freePort()
    child = spawn('node', [script, site, String(port)], { stdio: 'ignore' })
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await get(port, '/a.js')
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    throw new Error('the static server did not start')
  })

  afterAll(() => {
    child?.kill()
    rmSync(outer, { recursive: true, force: true })
  })

  it('serves a script as JavaScript', async () => {
    expect(await get(port, '/a.js')).toEqual({ status: 200, type: 'text/javascript; charset=utf-8' })
  })

  it('serves a font as font/woff2', async () => {
    expect(await get(port, '/f.woff2')).toEqual({ status: 200, type: 'font/woff2' })
  })

  it('answers 404 for a file that does not exist', async () => {
    expect((await get(port, '/missing.js')).status).toBe(404)
  })

  it('answers 404 for a path outside the folder', async () => {
    expect((await get(port, '/..%2Fsecret.txt')).status).toBe(404)
  })
})
