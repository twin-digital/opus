import type { ComponentTypeDefinition, Model } from '@thrashplay/wishem-core'
import { createStore } from '@thrashplay/wishem-core'
import {
  createChannelPair,
  createHub,
  openLink,
  serveLink,
  type Channel,
  type Hub,
  type Port,
  type RemoteLink,
} from '@thrashplay/wishem-hub'
import { describe, expect, it } from 'vitest'
import {
  createViewTools,
  RESERVED_PROP_NAMES,
  stubViewTools,
  type InputPort,
  type ViewToolsCall,
} from './view-tools.js'

const CT = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const FLD_TITLE = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const FLD_DONE = 'fld_aaaaaaaa-0000-4000-8000-000000000012'
const FLD_DUP = 'fld_aaaaaaaa-0000-4000-8000-000000000013'
const E1 = 'e_aaaaaaaa-0000-4000-8000-000000000021'

const definition: ComponentTypeDefinition = {
  id: CT,
  label: 'Task',
  fields: [
    { id: FLD_TITLE, label: 'Title', type: 'string' },
    { id: FLD_DONE, label: 'done', type: 'boolean' },
    { id: FLD_DUP, label: 'title', type: 'string' },
  ],
}

const model: Model = {
  definitions: [definition],
  entities: [{ id: E1, components: { [CT]: { [FLD_TITLE]: 'One', [FLD_DONE]: false } } }],
}

const world = () => {
  const hub = createHub({
    subsystems: [
      createStore({ model }),
      { id: 'time', inputs: ['time/set-running'], initial: {}, apply: (part: object) => part },
      {
        id: 'boom',
        inputs: ['boom/go'],
        initial: {},
        apply: () => {
          throw new Error('It broke.')
        },
      },
    ],
  })
  hub.start()
  return { hub, input: hub.attach({ id: 'tester', kind: 'input' }) }
}

const remote = async (hub: Hub) => {
  const [client, server] = createChannelPair()
  const sent: string[] = []
  const tapped: Channel = {
    ...client,
    send: (text) => {
      sent.push(text)
      client.send(text)
    },
  }
  serveLink(hub, server)
  const link: RemoteLink = await openLink(tapped, [{ id: 'remote-input', kind: 'input' }])
  return { link, port: link.ports['remote-input'], sent, server }
}

const toolsFor = (input?: InputPort) => createViewTools({ input, entity: E1, componentType: CT, definition })

const titleOf = (hub: Hub) =>
  ((hub.read().store as Model).entities[0]?.components[CT] as Record<string, unknown> | undefined)?.[FLD_TITLE]

describe('createViewTools with a direct port', () => {
  it('sends a set-field input with the IDs of the component and the field', async () => {
    const { hub, input } = world()
    const outcome = await toolsFor(input).setField('done', true)

    expect(outcome.ok).toBe(true)
    expect(hub.record()).toEqual([
      expect.objectContaining({
        source: 'tester',
        type: 'store/set-field',
        payload: { entity: E1, componentType: CT, field: FLD_DONE, value: true },
      }),
    ])
  })

  it('gives the first field of two fields that give one name', async () => {
    const { hub, input } = world()
    await toolsFor(input).setField('title', 'Changed')
    expect(titleOf(hub)).toBe('Changed')
  })

  it('gives invalid with a problem that names the name, and sends no input, for a name that no field has', async () => {
    const { hub, input } = world()
    const outcome = await toolsFor(input).setField('colour', 'red')

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
    expect(outcome.ok ? '' : outcome.problems.map((problem) => problem.message).join()).toContain('colour')
    expect(hub.record()).toEqual([])
  })

  it('gives invalid for a reserved name', async () => {
    const { hub, input } = world()
    expect(await toolsFor(input).setField('wishem', 'x')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(hub.record()).toEqual([])
  })

  it('gives invalid for an empty name, and sends no input', async () => {
    const { hub, input } = world()
    const empty: ComponentTypeDefinition = { ...definition, fields: [{ id: FLD_TITLE, label: '???', type: 'string' }] }
    const tools = createViewTools({ input, entity: E1, componentType: CT, definition: empty })

    expect(await tools.setField('', 'x')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(hub.record()).toEqual([])
  })

  it('gives the outcome ok with the sequence number of the hub', async () => {
    const { input } = world()
    const tools = toolsFor(input)
    await tools.setField('title', 'a')
    expect(await tools.setField('title', 'b')).toEqual({ ok: true, seq: 2 })
  })

  it('gives the rejection of the hub as the outcome', async () => {
    const { input } = world()
    const outcome = await toolsFor(input).setField('done', 'yes')
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
    expect(outcome.ok ? [] : outcome.problems).not.toEqual([])
  })

  it('sends the input of submit as it is', async () => {
    const { hub, input } = world()
    const outcome = await toolsFor(input).submit({ type: 'time/set-running', payload: { running: false } })

    expect(outcome.ok).toBe(true)
    expect(hub.record()).toEqual([
      expect.objectContaining({ source: 'tester', type: 'time/set-running', payload: { running: false } }),
    ])
  })

  it('gives unknown-type for an input that no subsystem takes', async () => {
    const { input } = world()
    expect(await toolsFor(input).submit({ type: 'nothing/here' })).toMatchObject({ ok: false, reason: 'unknown-type' })
  })

  it('gives not-permitted and sends no input when there is no input port', async () => {
    const { hub } = world()
    const tools = toolsFor(undefined)

    expect(await tools.setField('title', 'x')).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
    expect(await tools.submit({ type: 'time/set-running' })).toEqual({
      ok: false,
      reason: 'not-permitted',
      problems: [],
    })
    expect(hub.record()).toEqual([])
  })

  it('gives failed when the port rejects with an error', async () => {
    const port: InputPort = { submit: () => Promise.reject(new Error('boom')) }
    expect(await toolsFor(port).setField('title', 'x')).toEqual({ ok: false, reason: 'failed', problems: [] })
  })

  it('gives failed when the port throws', async () => {
    const port: InputPort = {
      submit: () => {
        throw new Error('boom')
      },
    }
    expect(await toolsFor(port).submit({ type: 'a/b' })).toEqual({ ok: false, reason: 'failed', problems: [] })
  })
})

describe('createViewTools with a remote port', () => {
  it('sends two inputs in order, and each call has its own outcome', async () => {
    const { hub } = world()
    const { port } = await remote(hub)
    const tools = toolsFor(port)

    const first = tools.setField('title', 'first')
    const second = tools.setField('title', 'second')
    const outcomes = await Promise.all([first, second])

    expect(outcomes).toEqual([
      { ok: true, seq: 1 },
      { ok: true, seq: 2 },
    ])
    expect(hub.record().map((entry) => (entry.payload as { value: string }).value)).toEqual(['first', 'second'])
    expect(titleOf(hub)).toBe('second')
  })

  it('gives not-running and sends no message when the link ended before the call', async () => {
    const { hub } = world()
    const { link, port, sent } = await remote(hub)
    link.close()
    await link.closed
    const before = sent.length

    expect(await toolsFor(port).setField('title', 'x')).toEqual({ ok: false, reason: 'not-running', problems: [] })
    expect(sent).toHaveLength(before)
    expect(hub.record()).toEqual([])
  })

  it('gives unknown, does not reject, and sends nothing again when the link ends while an input waits', async () => {
    const { hub } = world()
    const { link, port, sent } = await remote(hub)
    const tools = toolsFor(port)
    const waiting = tools.setField('title', 'x')
    const count = sent.length
    link.close()

    expect(await waiting).toEqual({ ok: false, reason: 'unknown', problems: [] })
    expect(sent).toHaveLength(count)
    expect(await tools.setField('title', 'y')).toMatchObject({ ok: false, reason: 'not-running' })
    expect(sent).toHaveLength(count)
  })

  it('gives failed when the result holds an error', async () => {
    const { hub } = world()
    const { port } = await remote(hub)
    expect(await toolsFor(port).submit({ type: 'boom/go' })).toEqual({ ok: false, reason: 'failed', problems: [] })
  })
})

describe('RESERVED_PROP_NAMES', () => {
  it('holds wishem and key', () => {
    expect(RESERVED_PROP_NAMES).toEqual(['wishem', 'key'])
  })
})

describe('stubViewTools', () => {
  it('gives the outcome ok with the number of the call by default', async () => {
    const { tools } = stubViewTools()
    expect(await tools.setField('a', 1)).toEqual({ ok: true, seq: 1 })
    expect(await tools.submit({ type: 'a/b' })).toEqual({ ok: true, seq: 2 })
  })

  it('gives a fixed outcome', async () => {
    const outcome = { ok: false, reason: 'not-running', problems: [] } as const
    const { tools } = stubViewTools(outcome)
    expect(await tools.setField('a', 'x')).toBe(outcome)
  })

  it('gives the outcome of a function', async () => {
    const { tools } = stubViewTools((call) =>
      call.kind === 'setField' ? { ok: true, seq: 9 } : { ok: false, reason: 'invalid', problems: [] },
    )
    expect(await tools.setField('a', 'x')).toEqual({ ok: true, seq: 9 })
    expect(await tools.submit({ type: 'a/b' })).toMatchObject({ ok: false })
  })

  it('gives a promise that never settles when the function gives one', async () => {
    const { tools } = stubViewTools(() => new Promise(() => undefined))
    const settled = await Promise.race([tools.setField('a', 'x').then(() => 'settled'), Promise.resolve('waiting')])
    expect(settled).toBe('waiting')
  })

  it('lists the calls in order', async () => {
    const { tools, calls } = stubViewTools()
    await tools.setField('title', 'a')
    await tools.submit({ type: 'a/b', payload: 1 })
    await tools.setField('done', true)

    const expected: ViewToolsCall[] = [
      { kind: 'setField', name: 'title', value: 'a' },
      { kind: 'submit', input: { type: 'a/b', payload: 1 } },
      { kind: 'setField', name: 'done', value: true },
    ]
    expect(calls).toEqual(expected)
  })
})
