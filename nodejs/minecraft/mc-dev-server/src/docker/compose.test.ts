import { describe, expect, it, vi } from 'vitest'

import { composeArgv, createComposeClient, parsePsOutput } from './compose.js'

import type { ComposeResult, ComposeRunner } from './compose.js'

const okResult: ComposeResult = { stdout: '', stderr: '', exitCode: 0 }

const recorder = (): { runner: ComposeRunner; calls: string[][] } => {
  const calls: string[][] = []
  return {
    calls,
    runner: vi.fn((args: readonly string[]) => {
      calls.push([...args])
      return Promise.resolve(okResult)
    }),
  }
}

describe('composeArgv', () => {
  // d-w8cc8n18 — an absolute -f path, and neither --project-directory nor an env file
  it('names the generated file by absolute path and nothing else', () => {
    expect(composeArgv('/tmp/mc-dev-server/proj/compose.yaml', ['up', '--detach'])).toEqual([
      'compose',
      '-f',
      '/tmp/mc-dev-server/proj/compose.yaml',
      'up',
      '--detach',
    ])
  })
})

describe('the compose client', () => {
  // d-uqdxo2w6 — packs reach the server with cp, reloads with exec
  it('copies with cp and runs commands with exec', async () => {
    const { runner, calls } = recorder()
    const client = createComposeClient(runner)

    await client.copyIn('/host/pack', '/data/development_behavior_packs/uuid')
    await client.exec(['send-command', 'reload'])

    expect(calls[0]).toEqual(['cp', '/host/pack', 'bedrock:/data/development_behavior_packs/uuid'])
    expect(calls[1]).toEqual(['exec', '-T', 'bedrock', 'send-command', 'reload'])
  })

  // d-zo2yl18y — stop leaves the volume, destroy removes it
  it('takes the volume down only when asked', async () => {
    const { runner, calls } = recorder()
    const client = createComposeClient(runner)

    await client.down()
    await client.down({ volumes: true })

    expect(calls[0]).toEqual(['down'])
    expect(calls[1]).toEqual(['down', '--volumes'])
  })

  // d-ifke5eeh — up only where the project is not already running
  it('brings the project up without recreating it', async () => {
    const { runner, calls } = recorder()

    await createComposeClient(runner).up()

    expect(calls[0]).toEqual(['up', '--detach', '--no-recreate'])
  })
})

describe('parsePsOutput', () => {
  // d-5ocyva9w — container settings are read by inspecting the running container
  it('reports the running container image and published port', () => {
    const stdout = JSON.stringify({
      Image: 'itzg/minecraft-bedrock-server:latest',
      State: 'running',
      Publishers: [{ TargetPort: 19132, PublishedPort: 19140 }],
    })

    expect(parsePsOutput(stdout)).toEqual({ image: 'itzg/minecraft-bedrock-server:latest', port: 19140 })
  })

  it('reports nothing when no container is running', () => {
    expect(parsePsOutput('')).toBeUndefined()
    expect(parsePsOutput(JSON.stringify({ Image: 'x', State: 'exited' }))).toBeUndefined()
  })
})
