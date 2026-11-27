import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createHub } from '../hub.js'
import type { ModelSubsystem } from '../types.js'
import { createChannelPair } from './channel.js'
import type { Channel } from './channel.js'
import { examples } from './examples.js'
import { parseClientMessage, parseHubMessage } from './messages.js'
import { openLink } from './open-link.js'
import { serveLink } from './serve-link.js'

const document = readFileSync(new URL('../../LINK.md', import.meta.url), 'utf8')

const jsonBlocks = [...document.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]) as unknown)

const counter: ModelSubsystem<{ count: number }> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
}

describe('the examples', () => {
  it.each(Object.entries(examples))('the example %s is a message that a reader accepts', (_name, message) => {
    const text = JSON.stringify(message)
    const parsed = ['hello', 'submit'].includes(message.t) ? parseClientMessage(text) : parseHubMessage(text)
    expect(parsed).toEqual(message)
  })
})

describe('LINK.md', () => {
  it('has only JSON blocks that equal an example', () => {
    expect(jsonBlocks.length).toBeGreaterThan(0)
    for (const block of jsonBlocks) {
      expect(Object.values(examples)).toContainEqual(block)
    }
  })

  it('shows each example', () => {
    for (const [name, example] of Object.entries(examples)) {
      expect(jsonBlocks, `The example ${name} is not in LINK.md.`).toContainEqual(example)
    }
  })
})

describe('a real link', () => {
  it('puts the example messages on the channel', async () => {
    const hub = createHub({ subsystems: [counter] })
    hub.start()
    const early = hub.attach({ id: 'early', kind: 'input' })
    await early.submit({ type: 'counter/add', payload: { by: 1 } })
    await early.submit({ type: 'counter/add', payload: { by: 2 } })
    await early.submit({ type: 'counter/add', payload: { by: 3 } })
    early.close()

    const [client, server] = createChannelPair()
    const seen: unknown[] = []
    const tapped: Channel = {
      ...server,
      send: (text) => {
        seen.push(JSON.parse(text))
        server.send(text)
      },
      onMessage: (listener) => {
        server.onMessage((text) => {
          seen.push(JSON.parse(text))
          listener(text)
        })
      },
    }
    serveLink(hub, tapped)

    const link = await openLink(client, [
      { id: 'page', kind: 'output' },
      { id: 'page-controls', kind: 'input' },
    ])
    const result = await link.ports['page-controls'].submit({ type: 'counter/add', payload: { by: 2 } })

    expect(result).toEqual({ ok: true, seq: 4 })
    expect(seen).toEqual([examples.hello, examples.welcome, examples.submit, examples.applied, examples.result])
  })
})
