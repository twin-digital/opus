import { describe, expect, it } from 'vitest'

import { levelNameFrom, runningServerFrom } from './state.js'

describe('reading a running server', () => {
  // d-5ocyva9w — the world a server is serving is read from its configuration on the volume
  it('reads the level name out of server.properties', () => {
    const properties = ['server-name=Dedicated Server', 'level-name = dev', 'level-seed=999111'].join('\n')

    expect(levelNameFrom(properties)).toBe('dev')
  })

  it('reports no level name when the file does not carry one', () => {
    expect(levelNameFrom('server-name=Dedicated Server\n')).toBeUndefined()
  })

  it('assembles what the start ladder compares', () => {
    const running = runningServerFrom({
      image: 'itzg/minecraft-bedrock-server:latest',
      port: 19132,
      serverProperties: 'level-name=dev\n',
      worlds: ['dev', 'other'],
      record: { version: 1, worlds: { dev: { seed: '424242' } } },
    })

    expect(running).toEqual({
      level: 'dev',
      image: 'itzg/minecraft-bedrock-server:latest',
      port: 19132,
      worlds: ['dev', 'other'],
      seeds: { dev: 424242n },
    })
  })
})
