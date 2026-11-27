import { describe, expect, it, vi } from 'vitest'
import { HubConfigurationError } from './errors.js'
import { createHub } from './hub.js'
import { HUB_ID, hubInputs, REWIND_INPUT_TYPE } from './names.js'
import { serveLink } from './link/serve-link.js'
import { createChannelPair } from './link/channel.js'
import type { HubMessage } from './link/messages.js'
import type { Hub, HubOptions, ModelSubsystem } from './types.js'

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => {
    const { by } = input.payload as { by: number }
    if (by < 0) {
      throw new Error('negative')
    }
    return { count: part.count + by }
  },
}

const add = { type: 'counter/add', payload: { by: 1 } }

const running = (options: Partial<HubOptions> = {}) => {
  const hub = createHub({ subsystems: [counter], ...options })
  const keyboard = hub.attach({ id: 'keyboard', kind: 'input' })
  hub.start()
  return { hub, keyboard }
}

const send = async (keyboard: ReturnType<Hub['attach']>, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await keyboard.submit(add)
  }
}

describe('reserved names', () => {
  it('exports the reserved names', () => {
    expect(HUB_ID).toBe('hub')
    expect(REWIND_INPUT_TYPE).toBe('hub/rewind')
  })

  it('refuses a model subsystem with the ID hub and names the ID', () => {
    const model: ModelSubsystem = { id: 'hub', inputs: [], initial: {}, apply: (part) => part }
    expect(() => createHub({ subsystems: [model] })).toThrow(HubConfigurationError)
    expect(() => createHub({ subsystems: [model] })).toThrow(/["'`]hub["'`]/)
  })

  it('refuses a model subsystem that declares a type of the hub and names the type', () => {
    const model: ModelSubsystem = { id: 'store', inputs: ['hub/rewind'], initial: {}, apply: (part) => part }
    expect(() => createHub({ subsystems: [model] })).toThrow(HubConfigurationError)
    expect(() => createHub({ subsystems: [model] })).toThrow(/hub\/rewind/)
    const other: ModelSubsystem = { id: 'store', inputs: ['hub/undo'], initial: {}, apply: (part) => part }
    expect(() => createHub({ subsystems: [other] })).toThrow(/hub\/undo/)
  })

  it('accepts a type whose first name only starts with hub', () => {
    const model: ModelSubsystem = { id: 'store', inputs: ['hubs/add'], initial: {}, apply: (part) => part }
    expect(() => createHub({ subsystems: [model] })).not.toThrow()
  })

  it('refuses to attach an I/O subsystem with the ID hub and names the ID', () => {
    const hub = createHub({ subsystems: [counter] })
    expect(() => hub.attach({ id: 'hub', kind: 'input' })).toThrow(HubConfigurationError)
    expect(() => hub.attach({ id: 'hub', kind: 'output' })).toThrow(/["'`]hub["'`]/)
  })

  it('refuses a hello with the ID hub with id-in-use', async () => {
    const { hub } = running()
    const [client, server] = createChannelPair()
    const messages: HubMessage[] = []
    client.onMessage((message) => messages.push(JSON.parse(message) as HubMessage))
    serveLink(hub, server)
    client.send(JSON.stringify({ t: 'hello', protocol: 1, subsystems: [{ id: 'hub', kind: 'output' }] }))
    await vi.waitFor(() => {
      expect(messages).toHaveLength(1)
    })
    expect(messages).toEqual([expect.objectContaining({ t: 'refused', reason: 'id-in-use' })])
  })
})

describe('Hub.seq', () => {
  it('is 0 for a new hub', () => {
    expect(createHub({ subsystems: [counter] }).seq).toBe(0)
  })

  it('counts accepted inputs and ignores rejected inputs', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 2)
    const rejected = await keyboard.submit({ type: 'counter/unknown' })
    expect(rejected.ok).toBe(false)
    expect(hub.seq).toBe(2)
  })

  it('is not the length of a limited record', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 2, recordLimit: 4 })
    await send(keyboard, 9)
    expect(hub.record().length).toBeLessThan(9)
    expect(hub.seq).toBe(9)
  })

  it('is the seq that serveLink sends in welcome, also for a limited record', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 2, recordLimit: 4 })
    await send(keyboard, 9)
    const [client, server] = createChannelPair()
    const messages: HubMessage[] = []
    client.onMessage((message) => messages.push(JSON.parse(message) as HubMessage))
    serveLink(hub, server)
    client.send(JSON.stringify({ t: 'hello', protocol: 1, subsystems: [{ id: 'page', kind: 'output' }] }))
    await vi.waitFor(() => {
      expect(messages).toHaveLength(1)
    })
    expect(messages[0]).toEqual(expect.objectContaining({ t: 'welcome', seq: 9 }))
  })
})

describe('the start of the record', () => {
  it('is the number 0 with the first joined state for a new hub', () => {
    const hub = createHub({ subsystems: [counter] })
    expect(hub.recordStart()).toEqual({ seq: 0, state: { counter: { count: 0 } } })
    expect(hub.recordStart().state).toBe(hub.read())
  })

  it('stays at 0 while the list holds three inputs', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 3)
    expect(hub.recordStart().seq).toBe(0)
    expect(hub.record().map((r) => r.seq)).toEqual([1, 2, 3])
  })
})

describe('checkpoints', () => {
  it('refer to the parts of the joined state with no copy', async () => {
    const { hub, keyboard } = running({ checkpointInterval: 2, recordLimit: 4 })
    await send(keyboard, 4)
    const joined = hub.read()
    await send(keyboard, 2)
    await send(keyboard, 2)
    const start = hub.recordStart()
    expect(start.seq).toBe(4)
    expect(start.state.counter).toBe(joined.counter)
  })
})

describe('the limit of the record', () => {
  it('moves the start to a checkpoint', async () => {
    const { hub, keyboard } = running({ recordLimit: 200, checkpointInterval: 100 })
    let at100: unknown
    for (let i = 1; i <= 250; i += 1) {
      await keyboard.submit(add)
      if (i === 100) {
        at100 = hub.read()
      }
    }
    expect(hub.recordStart().seq).toBe(100)
    expect(hub.recordStart().state).toBe(at100)
    const seqs = hub.record().map((r) => r.seq)
    expect(seqs[0]).toBe(101)
    expect(seqs.at(-1)).toBe(250)
    expect(seqs).toHaveLength(150)
    expect(hub.seq).toBe(250)
  })

  it('holds exactly the limit of inputs when a checkpoint is at the limit', async () => {
    const { hub, keyboard } = running({ recordLimit: 3, checkpointInterval: 1 })
    await send(keyboard, 4)
    expect(hub.recordStart().seq).toBe(1)
    expect(hub.record().map((r) => r.seq)).toEqual([2, 3, 4])
  })

  it('has the default interval 100 and the default limit 100000', async () => {
    const { hub, keyboard } = running()
    await send(keyboard, 100_000)
    expect(hub.recordStart().seq).toBe(0)
    expect(hub.record()).toHaveLength(100_000)
    await send(keyboard, 1)
    expect(hub.recordStart().seq).toBe(100)
    expect(hub.record()).toHaveLength(99_901)
  }, 30_000)

  it('keeps the start at a checkpoint that is the target of a rewind in the record', async () => {
    const { hub, keyboard } = running({ recordLimit: 10, checkpointInterval: 5 })
    await send(keyboard, 10)
    await keyboard.submit(hubInputs.rewind(5))
    expect(hub.seq).toBe(11)
    expect(hub.recordStart().seq).toBe(5)
    expect(hub.record()).toHaveLength(6)
  })

  it('holds no more inputs than the limit after each accepted input', async () => {
    const { hub, keyboard } = running({ recordLimit: 10, checkpointInterval: 5 })
    for (let i = 0; i < 40; i += 1) {
      await keyboard.submit(add)
      expect(hub.record().length).toBeLessThanOrEqual(10)
    }
  })

  it('refuses a limit that is smaller than the interval and names the two options', () => {
    const attempt = () => createHub({ subsystems: [counter], recordLimit: 50, checkpointInterval: 100 })
    expect(attempt).toThrow(HubConfigurationError)
    expect(attempt).toThrow(/recordLimit/)
    expect(attempt).toThrow(/checkpointInterval/)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses the interval %s', (checkpointInterval) => {
    expect(() => createHub({ subsystems: [counter], checkpointInterval })).toThrow(HubConfigurationError)
    expect(() => createHub({ subsystems: [counter], checkpointInterval })).toThrow(/checkpointInterval/)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses the limit %s', (recordLimit) => {
    expect(() => createHub({ subsystems: [counter], recordLimit })).toThrow(HubConfigurationError)
    expect(() => createHub({ subsystems: [counter], recordLimit })).toThrow(/recordLimit/)
  })

  it('accepts a limit that is equal to the interval', () => {
    expect(() => createHub({ subsystems: [counter], recordLimit: 5, checkpointInterval: 5 })).not.toThrow()
  })
})
