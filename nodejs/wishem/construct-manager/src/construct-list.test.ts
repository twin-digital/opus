import { createStore } from '@thrashplay/wishem-core'
import { createHub, hubInputs, type Hub, type Input, type Port, type SubmitResult } from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import { constructInputs, createConstructList } from './construct-list.js'
import { CONSTRUCT_MANAGER_ID, CONSTRUCTS_ID } from './ids.js'
import type { ConstructList } from './construct-list.js'

interface Rig {
  hub: Hub
  manager: Port
  client: Port
  part: () => ConstructList
}

const makeRig = (): Rig => {
  const hub = createHub({ subsystems: [createStore(), createConstructList()] })
  const manager = hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
  const client = hub.attach({ id: 'client', kind: 'input' })
  hub.start()
  return { hub, manager, client, part: () => hub.read()[CONSTRUCTS_ID] as ConstructList }
}

const refusal = (result: SubmitResult) => {
  if (result.ok) {
    throw new Error('The input was accepted.')
  }
  return result
}

const running = async (rig: Rig, id = 'play') => {
  await rig.client.submit(constructInputs.start(id))
  await rig.manager.submit(constructInputs.report({ construct: id, status: 'running', link: 'ws://127.0.0.1:1/link' }))
}

describe('the first part', () => {
  it('holds no construct', () => {
    expect(makeRig().part()).toEqual({ constructs: {} })
  })

  it('is frozen', () => {
    const { initial } = createConstructList()
    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(initial.constructs)).toBe(true)
  })
})

describe('constructInputs', () => {
  it('makes a start with no running key when the option is absent', () => {
    expect(constructInputs.start('play')).toStrictEqual({ type: 'constructs/start', payload: { construct: 'play' } })
    expect(constructInputs.start('play', { running: false })).toStrictEqual({
      type: 'constructs/start',
      payload: { construct: 'play', running: false },
    })
  })
})

describe('the input payload', () => {
  const types = ['constructs/start', 'constructs/stop', 'constructs/send', 'constructs/report'] as const

  it.each(types.flatMap((type) => [null, [], 5].map((payload) => [type, payload] as const)))(
    'refuses the type %s with the payload %j',
    async (type, payload) => {
      const rig = makeRig()
      const port = type === 'constructs/report' ? rig.manager : rig.client
      const result = refusal(await port.submit({ type, payload }))
      expect(result.reason).toBe('invalid')
      expect(result.problems.map((problem) => problem.path?.join('.'))).toEqual(['payload'])
    },
  )

  it.each(types)('refuses the type %s with a construct that is not a string', async (type) => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const port = type === 'constructs/report' ? rig.manager : rig.client
    const payload = { construct: ['play'], status: 'running', input: { type: 'time/set-running' } }
    const result = refusal(await port.submit({ type, payload }))
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it.each(['constructs/stop', 'constructs/send', 'constructs/report'] as const)(
    'refuses the type %s with a construct that is a key of Object.prototype',
    async (type) => {
      const rig = makeRig()
      const port = type === 'constructs/report' ? rig.manager : rig.client
      const payload = { construct: 'constructor', status: 'running', input: { type: 'time/set-running' } }
      const result = refusal(await port.submit({ type, payload }))
      expect(result.reason).toBe('invalid')
      expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
    },
  )
})

describe('constructs/start', () => {
  it('adds a pending construct that is wanted to run', async () => {
    const rig = makeRig()
    expect((await rig.client.submit(constructInputs.start('play'))).ok).toBe(true)
    expect(rig.part().constructs.play).toEqual({ want: 'running', startTime: 'running', status: 'pending' })
  })

  it('keeps the time state of a start in a pause', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('check', { running: false }))
    expect(rig.part().constructs.check.startTime).toBe('paused')
  })

  it('keeps the same part for a second start', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const before = rig.part()
    await rig.client.submit(constructInputs.start('play'))
    expect(rig.part()).toBe(before)
  })

  it('refuses an ID that is not correct', async () => {
    const rig = makeRig()
    const result = refusal(await rig.client.submit(constructInputs.start('Play 1')))
    expect(result.reason).toBe('invalid')
    expect(result.problems.some((problem) => problem.path?.join('.') === 'payload.construct')).toBe(true)
  })

  it.each(['a', 'play', 'a1', 'a-b', 'a-b-c2', 'a1-2b'])('accepts the ID "%s"', async (id) => {
    const rig = makeRig()
    expect((await rig.client.submit(constructInputs.start(id))).ok).toBe(true)
  })

  it.each(['', 'Play', '1a', 'a-', '-a', 'a--b', 'a_b', 'a b', 'play!', '!play'])('refuses the ID "%s"', async (id) => {
    const rig = makeRig()
    const result = refusal(await rig.client.submit(constructInputs.start(id)))
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it('refuses a running value that is not a boolean', async () => {
    const rig = makeRig()
    const result = refusal(
      await rig.client.submit({ type: 'constructs/start', payload: { construct: 'a', running: 1 } }),
    )
    expect(result.problems[0]?.path?.join('.')).toBe('payload.running')
  })

  it('sets pending and removes the report of a stopped entry', async () => {
    const rig = makeRig()
    await running(rig)
    await rig.client.submit(constructInputs.stop('play'))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'stopped', message: 'done' }))
    await rig.client.submit(constructInputs.start('play', { running: false }))
    expect(rig.part().constructs.play).toEqual({ want: 'running', startTime: 'paused', status: 'pending' })
  })

  it('sets pending and removes the message of a failed entry after a stop', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'failed', message: 'broken' }))
    await rig.client.submit(constructInputs.stop('play'))
    await rig.client.submit(constructInputs.start('play'))
    expect(rig.part().constructs.play).toEqual({ want: 'running', startTime: 'running', status: 'pending' })
  })
})

describe('constructs/stop', () => {
  it('sets the wanted state and keeps the entry', async () => {
    const rig = makeRig()
    await running(rig)
    await rig.client.submit(constructInputs.stop('play'))
    expect(rig.part().constructs.play).toEqual({
      want: 'stopped',
      startTime: 'running',
      status: 'running',
      link: 'ws://127.0.0.1:1/link',
    })
  })

  it('refuses a construct that is not in the list', async () => {
    const rig = makeRig()
    const result = refusal(await rig.client.submit(constructInputs.stop('other')))
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it('keeps the same part for a second stop', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    await rig.client.submit(constructInputs.stop('play'))
    const before = rig.part()
    await rig.client.submit(constructInputs.stop('play'))
    expect(rig.part()).toBe(before)
  })
})

describe('constructs/send', () => {
  const pause: Input = { type: 'time/set-running', payload: { running: false } }

  it('keeps the same part for a running construct and records the input', async () => {
    const rig = makeRig()
    await running(rig)
    const before = rig.part()
    const result = await rig.client.submit(constructInputs.send('play', pause))
    expect(result.ok).toBe(true)
    expect(rig.part()).toBe(before)
    expect(rig.hub.record().at(-1)?.type).toBe('constructs/send')
  })

  it.each(['pending', 'stopped'] as const)('refuses a construct with the status %s', async (status) => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    if (status === 'stopped') {
      await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'stopped' }))
    }
    const result = refusal(await rig.client.submit(constructInputs.send('play', pause)))
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it('refuses a construct that is not wanted to run', async () => {
    const rig = makeRig()
    await running(rig)
    await rig.client.submit(constructInputs.stop('play'))
    expect(refusal(await rig.client.submit(constructInputs.send('play', pause))).reason).toBe('invalid')
  })

  it('refuses a construct that is not in the list', async () => {
    const rig = makeRig()
    const result = refusal(await rig.client.submit(constructInputs.send('ghost', pause)))
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it.each([null, 'text', 5, []])('refuses the input %j', async (input) => {
    const rig = makeRig()
    await running(rig)
    const result = refusal(await rig.client.submit({ type: 'constructs/send', payload: { construct: 'play', input } }))
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.input.type')
  })

  it('refuses an input with no string type', async () => {
    const rig = makeRig()
    await running(rig)
    const result = refusal(
      await rig.client.submit({ type: 'constructs/send', payload: { construct: 'play', input: { payload: 1 } } }),
    )
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.input.type')
  })
})

describe('constructs/report', () => {
  const link = 'ws://127.0.0.1:41377/link'

  it('sets the status of a report of the construct manager', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link, time: 'running' }))
    expect(rig.part().constructs.play).toEqual({
      want: 'running',
      startTime: 'running',
      status: 'running',
      link,
      time: 'running',
    })
  })

  it('refuses a report from a different source and keeps the part', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const before = rig.part()
    const result = refusal(
      await rig.client.submit(constructInputs.report({ construct: 'play', status: 'running', link })),
    )
    expect(result.reason).toBe('invalid')
    expect(rig.part()).toBe(before)
  })

  it('keeps the same part for the same report two times', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const report = constructInputs.report({ construct: 'play', status: 'running', link, time: 'paused' })
    await rig.manager.submit(report)
    const before = rig.part()
    await rig.manager.submit(report)
    expect(rig.part()).toBe(before)
  })

  it.each(['stopped', 'failed'] as const)('removes the link and the time for the status %s', async (status) => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link, time: 'running' }))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status, link, time: 'running', message: 'm' }))
    expect(rig.part().constructs.play).toEqual({
      want: 'running',
      startTime: 'running',
      status,
      message: 'm',
    })
  })

  it('keeps lastSend when a later report has none', async () => {
    const rig = makeRig()
    await running(rig)
    const lastSend = { seq: 9, result: { ok: true as const, seq: 12 } }
    await rig.manager.submit(
      constructInputs.report({ construct: 'play', status: 'running', link: 'ws://x/link', lastSend }),
    )
    await rig.manager.submit(
      constructInputs.report({ construct: 'play', status: 'running', link: 'ws://x/link', time: 'paused' }),
    )
    expect(rig.part().constructs.play.lastSend).toEqual(lastSend)
  })

  it.each([
    ['link', 5, 'payload.link'],
    ['time', 'later', 'payload.time'],
    ['message', 5, 'payload.message'],
    ['lastSend', null, 'payload.lastSend'],
    ['lastSend', { seq: 'one' }, 'payload.lastSend'],
  ])('refuses a report with the value %s that is %j', async (key, value, path) => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const before = rig.part()
    const result = refusal(
      await rig.manager.submit({
        type: 'constructs/report',
        payload: { construct: 'play', status: 'running', [key]: value },
      }),
    )
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe(path)
    expect(rig.part()).toBe(before)
  })

  it('keeps the time state of the start when a report comes', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play', { running: false }))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', time: 'running' }))
    expect(rig.part().constructs.play.startTime).toBe('paused')
  })

  it('replaces lastSend with the lastSend of a later report', async () => {
    const rig = makeRig()
    await running(rig)
    const link = 'ws://127.0.0.1:1/link'
    const first = { seq: 3, result: { ok: true as const, seq: 4 } }
    const second = { seq: 8, result: { ok: true as const, seq: 9 } }
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link, lastSend: first }))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link, lastSend: second }))
    expect(rig.part().constructs.play.lastSend).toEqual(second)
  })

  it('removes the message when a later report has no message', async () => {
    const rig = makeRig()
    await running(rig)
    const link = 'ws://127.0.0.1:1/link'
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link, message: 'refused' }))
    expect(rig.part().constructs.play.message).toBe('refused')
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link }))
    expect(rig.part().constructs.play).not.toHaveProperty('message')
  })

  it('changes the part for a report with a different link of the same length', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link: 'ws://a/link' }))
    await rig.manager.submit(constructInputs.report({ construct: 'play', status: 'running', link: 'ws://b/link' }))
    expect(rig.part().constructs.play.link).toBe('ws://b/link')
  })

  it('refuses a construct that is not in the list', async () => {
    const rig = makeRig()
    const result = refusal(await rig.manager.submit(constructInputs.report({ construct: 'ghost', status: 'running' })))
    expect(result.reason).toBe('invalid')
    expect(result.problems[0]?.path?.join('.')).toBe('payload.construct')
  })

  it('refuses a status that is not correct', async () => {
    const rig = makeRig()
    await rig.client.submit(constructInputs.start('play'))
    const result = refusal(
      await rig.manager.submit({ type: 'constructs/report', payload: { construct: 'play', status: 'pending' } }),
    )
    expect(result.problems[0]?.path?.join('.')).toBe('payload.status')
  })
})

describe('the record', () => {
  it('returns to the state before a start with a rewind', async () => {
    const rig = makeRig()
    const start = rig.hub.seq
    await rig.client.submit(constructInputs.start('play'))
    expect(Object.keys(rig.part().constructs)).toEqual(['play'])
    await rig.client.submit(hubInputs.rewind(start))
    expect(rig.part()).toEqual({ constructs: {} })
  })

  it('gives an equal part when a new hub replays the record', async () => {
    const rig = makeRig()
    await running(rig, 'play')
    await rig.client.submit(constructInputs.start('check', { running: false }))
    await rig.client.submit(constructInputs.stop('check'))
    await rig.manager.submit(constructInputs.report({ construct: 'check', status: 'stopped' }))
    await rig.client.submit(constructInputs.send('play', { type: 'time/set-running', payload: { running: false } }))

    const replay = createHub({
      subsystems: [createStore(), createConstructList()],
      record: { start: rig.hub.recordStart(), inputs: rig.hub.record() },
    })
    expect(replay.read()[CONSTRUCTS_ID]).toEqual(rig.part())
  })
})
