import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Snapshot } from '@thrashplay/wishem-core'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const until = async (check: () => boolean, describe_: () => string, ms = 15000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describe_()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe('the start script of the base workbench', () => {
  let child: ChildProcess | undefined

  afterEach(async () => {
    if (child?.pid !== undefined && child.exitCode === null) {
      const closed = new Promise((resolve) => child?.on('close', resolve))
      // The script runs in a shell below pnpm, so the signal goes to the process group.
      process.kill(-child.pid, 'SIGINT')
      await closed
    }
    child = undefined
  })

  it('starts a core that serves the AppBar model', { timeout: 30000 }, async () => {
    child = spawn('pnpm', ['start', '--port', '0'], {
      cwd: packageRoot,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
    let exited = false
    child.on('close', () => (exited = true))

    const address = /wishem: snapshot at (http:\/\/127\.0\.0\.1:\d+\/snapshot)/
    await until(
      () => address.test(output) || exited,
      () => output,
    )
    const url = address.exec(output)?.[1]
    if (url === undefined) {
      expect.fail(`the start script stopped with no address:\n${output}`)
    }

    const response = await fetch(url)
    expect(response.status).toBe(200)
    const snapshot = (await response.json()) as Snapshot

    expect(snapshot.definitions.map((definition) => definition.label)).toEqual(['AppBar'])
    expect(snapshot.entities).toHaveLength(1)
    const type = snapshot.definitions[0]
    expect(snapshot.entities[0].components[type.id]).toEqual({ [type.fields[0].id]: 'Wishem' })
  })
})
