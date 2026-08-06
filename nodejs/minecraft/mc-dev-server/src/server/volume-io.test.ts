import { describe, expect, it } from 'vitest'

import { createFakeServer } from '../docker/fake-server.test.helpers.js'
import { StopTimeoutError, stopServer } from './console.js'
import { readWorldsRecord, seedsOf, withWorld, writeWorldsRecord } from './seed-record.js'
import { readRunningServer } from './state.js'

const standing = async (): Promise<ReturnType<typeof createFakeServer>> => {
  const server = createFakeServer({ image: 'itzg/minecraft-bedrock-server:latest', port: 19140, level: 'dev' })
  await server.up()
  await new Promise((resolve) => setTimeout(resolve, 20))
  return server
}

describe('the worlds record on the volume', () => {
  // d-5ocyva9w — the only way back to a world's generation seed
  it('travels to the volume by cp and reads back exactly', async () => {
    const server = await standing()

    await writeWorldsRecord(server, withWorld({ version: 1, worlds: {} }, 'dev', -9223372036854775808n))

    expect(server.operations).toContain('cp /data/.mc-dev-server/worlds.json')
    expect(seedsOf(await readWorldsRecord(server)).dev).toBe(-9223372036854775808n)
  })

  it('reads a volume holding no record as empty', async () => {
    expect((await readWorldsRecord(await standing())).worlds).toEqual({})
  })
})

describe('reading a running server', () => {
  // d-5ocyva9w — read off the server, not off anything the harness stamped there
  it('reports the container settings, the served world, the worlds held, and the seeds', async () => {
    const server = await standing()
    server.volume.dirs.add('/data/worlds/holiday')
    await writeWorldsRecord(server, withWorld({ version: 1, worlds: {} }, 'dev', 424242n))

    expect(await readRunningServer(server)).toEqual({
      level: 'dev',
      image: 'itzg/minecraft-bedrock-server:latest',
      port: 19140,
      worlds: ['dev', 'holiday'],
      seeds: { dev: 424242n },
    })
  })

  it('reports nothing when the project is not up', async () => {
    const server = await standing()
    await server.down()

    expect(await readRunningServer(server)).toBeUndefined()
  })
})

describe('taking the server down', () => {
  // d-7ayy4btp — the console stop, waited for, never a container kill
  it('issues the console stop and waits for the container to go', async () => {
    const server = await standing()

    await stopServer(server, 5_000, 5)

    expect(server.operations).toContain('console stop')
    expect(server.isRunning()).toBe(false)
  })

  it('fails rather than killing a server that will not go down', async () => {
    const server = await standing()
    const stubborn = { ...server, exec: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }) }

    await expect(stopServer(stubborn, 30, 5)).rejects.toBeInstanceOf(StopTimeoutError)
    expect(server.isRunning()).toBe(true)
  })
})
