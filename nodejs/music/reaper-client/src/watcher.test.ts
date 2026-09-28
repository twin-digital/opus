import { afterEach, describe, expect, it } from 'vitest'
import { watcherScript } from './paths.js'
import { SECTION } from './protocol.js'
import { startWatcher } from '../test/watcher-harness.js'

let watcher: Awaited<ReturnType<typeof startWatcher>>
afterEach(async () => {
  await watcher.sim.close()
})

const request = (command: string, options?: object) => ({
  v: 1,
  generation: watcher.generation(),
  command,
  options,
})

describe('status', () => {
  it('publishes the protocol, version, generation and project on start', async () => {
    watcher = await startWatcher()
    expect(watcher.status()).toEqual({
      v: 1,
      version: 'dev',
      generation: expect.stringMatching(/^[0-9a-f]{16}$/) as unknown,
      heartbeat: 0,
      project: { name: '', path: '' },
    })
  })

  it('counts the heartbeat once a second, not once a tick', async () => {
    watcher = await startWatcher()
    for (let i = 0; i < 5; i++) {
      watcher.sim.tick()
    }
    expect(watcher.status()?.heartbeat).toBe(0)
    watcher.advance(1)
    watcher.sim.tick()
    watcher.sim.tick()
    expect(watcher.status()?.heartbeat).toBe(1)
    watcher.advance(2.5)
    watcher.sim.tick()
    expect(watcher.status()?.heartbeat).toBe(2)
  })

  it('keeps the generation while the project stays current', async () => {
    watcher = await startWatcher()
    const generation = watcher.generation()
    watcher.advance(3)
    watcher.sim.tick()
    expect(watcher.generation()).toBe(generation)
  })

  it('makes a new generation whenever the current project changes', async () => {
    watcher = await startWatcher()
    const first = watcher.sim.model.currentProject
    const seen = new Set([watcher.generation()])

    const song = watcher.sim.model.openProject('/songs/song.rpp')
    watcher.sim.tick()
    expect(watcher.status()?.project).toEqual({ name: 'song.rpp', path: '/songs/song.rpp' })
    seen.add(watcher.generation())

    watcher.sim.model.selectProject(first)
    watcher.sim.tick()
    seen.add(watcher.generation())

    watcher.sim.model.selectProject(song)
    watcher.sim.tick()
    seen.add(watcher.generation())

    watcher.sim.model.closeProject(song)
    watcher.sim.tick()
    seen.add(watcher.generation())
    expect(seen.size).toBe(5)
  })

  it('clears its status when stopped', async () => {
    watcher = await startWatcher()
    watcher.sim.stopScript(watcher.script)
    expect(watcher.status()).toBeUndefined()
  })

  it('hands over to a second copy started beside it', async () => {
    watcher = await startWatcher()
    const second = await watcher.sim.loadScriptFile(watcherScript)
    const generation = watcher.generation()
    watcher.sim.tick()
    expect(watcher.script.running).toBe(false)
    expect(second.running).toBe(true)
    expect(watcher.generation()).toBe(generation)
  })
})

describe('requests', () => {
  it('runs a command and answers with its result', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('echo', { text: 'hi', n: [1, 2] }))
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual({ v: 1, ok: true, result: { text: 'hi', n: [1, 2] } })
  })

  it('deletes each request before running it', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('throws'))
    await watcher.post('A2', request('echo', { x: 1 }))
    watcher.sim.tick()
    expect(watcher.sim.model.currentProject.extState.entries(SECTION)).toEqual([])
    watcher.sim.tick()
    expect(
      watcher.sim.calls.filter((call) => call.fn === 'SetExtState' && String(call.args[1]).startsWith('RES_')),
    ).toHaveLength(2)
  })

  it('runs the requests found in one tick in id order', async () => {
    watcher = await startWatcher()
    await watcher.post('B', request('record', { mark: 'b' }))
    await watcher.post('C', request('record', { mark: 'c' }))
    await watcher.post('A', request('record', { mark: 'a' }))
    watcher.sim.tick()
    expect(watcher.sim.model.globalExtState.get('TEST', 'marks')).toBe('abc')
  })

  it('ignores other keys in the section', async () => {
    watcher = await startWatcher()
    await watcher.sim.fetch('/_/SET/PROJEXTSTATE/thrashplay/OTHER/value')
    watcher.sim.tick()
    expect(watcher.sim.model.currentProject.extState.get(SECTION, 'OTHER')).toBe('value')
  })

  it('answers UNKNOWN_COMMAND for a command it lacks', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('nope'))
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual({
      v: 1,
      ok: false,
      error: { code: 'UNKNOWN_COMMAND', message: 'unknown command: nope' },
    })
  })

  it.each([
    ['not JSON', '{nope', 'request is not a JSON object'],
    ['not an object', '"text"', 'request is not a JSON object'],
    ['another protocol', { v: 2, generation: 'g', command: 'echo' }, 'unsupported protocol version: 2'],
    ['no generation', { v: 1, command: 'echo' }, 'request needs a generation and a command'],
    ['no command', { v: 1, generation: 'g' }, 'request needs a generation and a command'],
    [
      'options that are not an object',
      { v: 1, generation: 'g', command: 'echo', options: 3 },
      'options must be an object',
    ],
  ])('answers BAD_REQUEST for %s', async (_, body, message) => {
    watcher = await startWatcher()
    await watcher.post('A1', body)
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual({ v: 1, ok: false, error: { code: 'BAD_REQUEST', message } })
  })
})

describe('generations', () => {
  const wrongProject = (name = '', path = '') => ({
    v: 1,
    ok: false,
    error: { code: 'WRONG_PROJECT', message: 'the current project changed', details: { project: { name, path } } },
  })

  it('refuses a request for another generation', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', { ...request('echo'), generation: '0123456789abcdef' })
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual(wrongProject())
  })

  it('refuses a request posted just before the project changed', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('record', { mark: 'x' }))
    // lands in the old project, which is no longer read; a new one opens and receives the next post
    watcher.sim.model.openProject('/songs/b.rpp')
    await watcher.post('A2', { ...request('record', { mark: 'y' }), generation: watcher.generation() })
    watcher.sim.tick()
    expect(watcher.response('A2')).toEqual(wrongProject('b.rpp', '/songs/b.rpp'))
    expect(watcher.sim.model.globalExtState.get('TEST', 'marks')).toBeUndefined()
  })

  it('refuses a request left behind in a project when it becomes current again', async () => {
    watcher = await startWatcher()
    const first = watcher.sim.model.currentProject
    await watcher.post('A1', request('record', { mark: 'x' }))
    watcher.sim.model.openProject('/songs/b.rpp')
    watcher.sim.tick()
    watcher.sim.model.selectProject(first)
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual(wrongProject())
    expect(watcher.sim.model.globalExtState.get('TEST', 'marks')).toBeUndefined()
  })
})

describe('failures', () => {
  it('answers FAILED when a command throws, and keeps running', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('throws'))
    watcher.sim.tick()
    expect(watcher.response('A1')).toEqual({
      v: 1,
      ok: false,
      error: { code: 'FAILED', message: 'deliberate failure' },
    })
    await watcher.post('A2', request('echo', { x: 1 }))
    watcher.sim.tick()
    expect(watcher.response('A2')).toMatchObject({ ok: true })
  })

  it('answers FAILED when a result cannot be encoded', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('unencodable'))
    watcher.sim.tick()
    expect(watcher.response('A1')).toMatchObject({
      ok: false,
      error: { code: 'FAILED', message: expect.stringMatching(/^result is not JSON-encodable: /) as unknown },
    })
  })

  it.each([
    ['does not compile', 'broken', /^command failed to load: .*broken\.lua/],
    ['does not return a function', 'not-a-function', /^command failed to load: module did not return a function$/],
  ])('answers FAILED for a command file that %s', async (_, command, message) => {
    watcher = await startWatcher()
    await watcher.post('A1', request(command))
    watcher.sim.tick()
    expect(watcher.response('A1')).toMatchObject({ ok: false, error: { code: 'FAILED', message } })
  })
})

describe('responses', () => {
  it('deletes a response nobody collected after a minute', async () => {
    watcher = await startWatcher()
    await watcher.post('A1', request('echo', { x: 1 }))
    watcher.sim.tick()
    watcher.advance(59)
    watcher.sim.tick()
    expect(watcher.response('A1')).toBeDefined()
    watcher.advance(1)
    watcher.sim.tick()
    expect(watcher.response('A1')).toBeUndefined()
  })
})
