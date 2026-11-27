import { expect, it } from 'vitest'
// The README example imports from '@thrashplay/wishem-hub'.
import { createChannelPair, createHub, openLink, serveLink, type ModelSubsystem } from './index.js'

it('runs the link example of the README', async () => {
  const counter: ModelSubsystem<{ count: number }> = {
    id: 'counter',
    inputs: ['counter/add'],
    initial: { count: 0 },
    apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
  }

  const hub = createHub({ subsystems: [counter] })
  hub.start()

  const [clientChannel, hubChannel] = createChannelPair()
  serveLink(hub, hubChannel)
  const link = await openLink(clientChannel, [
    { id: 'screen', kind: 'output' },
    { id: 'buttons', kind: 'input' },
  ])
  const shown: unknown[] = []
  link.ports.screen.subscribe((event) => {
    if (event.type === 'applied') {
      shown.push(link.ports.screen.read().counter)
    }
  })
  const accepted = await link.ports.buttons.submit({ type: 'counter/add', payload: { by: 2 } })

  expect(accepted).toEqual({ ok: true, seq: 1 })
  expect(shown).toEqual([{ count: 2 }])
})

it('runs the example of the README', async () => {
  const counter: ModelSubsystem<{ count: number }> = {
    id: 'counter',
    inputs: ['counter/add'],
    initial: { count: 0 },
    apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
  }

  const hub = createHub({ subsystems: [counter] })
  const buttons = hub.attach({ id: 'buttons', kind: 'input' })
  const screen = hub.attach({ id: 'screen', kind: 'output' })
  const shown: unknown[] = []
  screen.subscribe((event) => {
    if (event.type === 'applied') {
      shown.push(screen.read().counter)
    }
  })
  hub.start()
  const accepted = await buttons.submit({ type: 'counter/add', payload: { by: 2 } })
  const refused = await screen.submit({ type: 'counter/add', payload: { by: 2 } })

  expect(accepted).toEqual({ ok: true, seq: 1 })
  expect(refused).toEqual({ ok: false, reason: 'not-permitted', problems: [] })
  expect(shown).toEqual([{ count: 2 }])
})
