import { fileURLToPath } from 'node:url'
// The README example imports from '@thrashplay/wishem-construct-manager' and its entry 'node'.
import { createStore, type Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { createHub } from '@thrashplay/wishem-hub'
import { behaviors } from '@thrashplay/wishem-sample-product'
import { expect, it } from 'vitest'
import { constructInputs, createConstructList } from './index.js'
import type { ConstructList } from './index.js'
import { attachConstructManager } from './node.js'

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

it('runs the example of the README', async () => {
  const folder = fileURLToPath(new URL('../../sample-product/model', import.meta.url))
  const model = (await readModelFolder(folder)).data as Model
  const lines: string[] = []

  const hub = createHub({
    subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
  })
  hub.start()
  const manager = attachConstructManager({ hub, behaviors, log: (line) => lines.push(line) })
  const client = hub.attach({ id: 'client', kind: 'input' })
  const entry = () => (hub.read().constructs as ConstructList).constructs.play

  await client.submit(constructInputs.start('play'))
  await eventually(() => entry().status === 'running')
  expect(entry().link).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
  await client.submit(constructInputs.send('play', { type: 'time/set-running', payload: { running: false } }))
  await eventually(() => entry().time === 'paused')
  await client.submit(constructInputs.stop('play'))
  await eventually(() => entry().status === 'stopped')
  await manager.close()
  hub.stop()
  expect(lines.at(-1)).toBe('wishem: construct play stopped')
})
