import { afterEach, describe, expect, it } from 'vitest'
import { createReaperClient, type FetchLike, type ReaperClientOptions } from './client.js'
import { ReaperError } from './errors.js'
import { SECTION, STATUS_KEY } from './protocol.js'
import { startWatcher } from '../test/watcher-harness.js'

let watcher: Awaited<ReturnType<typeof startWatcher>>
let stopTicking = () => undefined as unknown
afterEach(async () => {
  stopTicking()
  await watcher.sim.close()
})

/**
 * A client of a simulated REAPER whose watcher ticks every few milliseconds.
 */
const connect = async (options: Partial<ReaperClientOptions> = {}, { ticking = true } = {}) => {
  watcher = await startWatcher()
  if (ticking) {
    stopTicking = watcher.sim.run(5)
  }
  return createReaperClient({ url: 'http://reaper', fetch: watcher.sim.fetch, pollIntervalMs: 5, ...options })
}

const rejection = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ReaperError)
  return error as ReaperError
}

describe('commands', () => {
  it('runs a command in the current project and resolves with its result', async () => {
    const client = await connect()
    const project = await client.currentProject()
    expect(project).toMatchObject({ generation: watcher.generation(), name: '', path: '' })
    expect(await project.runCommand('echo', { text: 'hi' })).toEqual({ text: 'hi' })
  })

  it('carries text that the web remote escapes', async () => {
    const client = await connect()
    const project = await client.currentProject()
    const text = 'tab\there\nnewline \\ backslash "quotes" /slash; semi é 🎹 %41'
    expect(await project.runCommand('echo', { text })).toEqual({ text })
  })

  it('runs commands for a generation seen earlier', async () => {
    const client = await connect()
    const { generation } = await client.getWatcherStatus()
    expect(await client.project(generation).runCommand('echo', { x: 1 })).toEqual({ x: 1 })
  })

  it('rejects with the watcher error code', async () => {
    const client = await connect()
    const project = await client.currentProject()
    const error = await rejection(project.runCommand('nope'))
    expect(error).toMatchObject({ code: 'UNKNOWN_COMMAND', message: 'unknown command: nope' })
  })

  it('rejects with WRONG_PROJECT once the project changes, naming the new one', async () => {
    const client = await connect()
    const project = await client.currentProject()
    watcher.sim.model.openProject('/songs/b.rpp')
    const error = await rejection(project.runCommand('record', { mark: 'x' }))
    expect(error).toMatchObject({
      code: 'WRONG_PROJECT',
      details: { project: { name: 'b.rpp', path: '/songs/b.rpp' } },
    })
    expect(watcher.sim.model.globalExtState.get('TEST', 'marks')).toBeUndefined()
  })

  it('refuses a request longer than REAPER takes, without sending it', async () => {
    const client = await connect()
    const project = await client.currentProject()
    const sent = watcher.sim.webRequests.length
    const error = await rejection(project.runCommand('echo', { text: 'x'.repeat(1000) }))
    expect(error.code).toBe('REQUEST_TOO_LARGE')
    expect(watcher.sim.webRequests).toHaveLength(sent)
  })
})

describe('timeouts', () => {
  it('rejects with TIMEOUT when the watcher never answers, and withdraws the request', async () => {
    const client = await connect({ timeoutMs: 100 }, { ticking: false })
    watcher.sim.tick()
    const project = await client.currentProject()
    const error = await rejection(project.runCommand('echo'))
    expect(error.code).toBe('TIMEOUT')
    expect(watcher.sim.model.currentProject.extState.entries(SECTION)).toEqual([])
  })

  it('caps a request timeout at the client timeout', async () => {
    const client = await connect({ timeoutMs: 100 }, { ticking: false })
    const project = await client.currentProject()
    const started = Date.now()
    await rejection(project.runCommand('echo', {}, { timeoutMs: 60_000 }))
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('honors a shorter request timeout', async () => {
    const client = await connect({ timeoutMs: 60_000 }, { ticking: false })
    const project = await client.currentProject()
    const started = Date.now()
    await rejection(project.runCommand('echo', {}, { timeoutMs: 100 }))
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('the watcher', () => {
  it('reports its status', async () => {
    const client = await connect()
    expect(await client.getWatcherStatus()).toEqual(watcher.status())
  })

  it('rejects with WATCHER_NOT_RUNNING when no watcher runs', async () => {
    const client = await connect()
    watcher.sim.stopScript(watcher.script)
    expect((await rejection(client.currentProject())).code).toBe('WATCHER_NOT_RUNNING')
  })

  it('rejects with INCOMPATIBLE_WATCHER for another protocol', async () => {
    const client = await connect({}, { ticking: false })
    watcher.sim.model.globalExtState.set(SECTION, STATUS_KEY, JSON.stringify({ ...watcher.status(), v: 2 }))
    expect((await rejection(client.getWatcherStatus())).code).toBe('INCOMPATIBLE_WATCHER')
  })
})

describe('the web remote', () => {
  it('rejects with REAPER_UNREACHABLE when the web remote cannot be reached', async () => {
    const failing: FetchLike = () => Promise.reject(new TypeError('fetch failed'))
    const client = await connect({ fetch: failing })
    expect((await rejection(client.getWatcherStatus())).code).toBe('REAPER_UNREACHABLE')
  })

  it('sends credentials, and talks to localhost over IPv4', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const client = await connect({
      url: 'http://localhost:8080/',
      auth: { username: 'me', password: 'secret' },
      fetch: (url, init) => {
        seen.push({ url, headers: init.headers })
        return watcher.sim.fetch(url)
      },
    })
    await client.getWatcherStatus()
    expect(seen[0]).toEqual({
      url: 'http://127.0.0.1:8080/_/GET/EXTSTATE/THRASHPLAY/WATCHER',
      headers: { authorization: `Basic ${btoa('me:secret')}` },
    })
  })

  it('works over HTTP', async () => {
    watcher = await startWatcher()
    stopTicking = watcher.sim.run(5)
    const client = createReaperClient({ url: await watcher.sim.listen(), pollIntervalMs: 5 })
    const project = await client.currentProject()
    expect(await project.runCommand('echo', { over: 'http' })).toEqual({ over: 'http' })
  })
})
