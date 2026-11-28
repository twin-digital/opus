import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { timeInputs } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { RemoteLink } from '@thrashplay/wishem-hub'
import { PNG } from 'pngjs'
import { startGodotConstruct } from '../src/construct/process.ts'
import type { GodotConstruct } from '../src/construct/process.ts'
import { runGodot } from '../src/runner/run-godot.ts'
import type { GodotRun } from '../src/runner/run-godot.ts'

const SHOTS_DIR = join(import.meta.dirname, '..', '.out', 'test-shots')
const WAIT_MS = 30_000
const BLUE = '#1d4ed8'
const RED = '#b91c1c'

interface Shot {
  seq: number
  file: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async <T>(what: string, find: () => T | undefined, ms = WAIT_MS): Promise<T> => {
  const deadline = Date.now() + ms
  for (;;) {
    const found = find()
    if (found !== undefined) {
      return found
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout while waiting for: ${what}`)
    }
    await sleep(50)
  }
}

/** Asserts that each pixel of the PNG file has the color, with at most 2 of difference in each channel. */
const assertAllPixels = (file: string, color: string) => {
  const expected = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  const { data, width, height } = PNG.sync.read(readFileSync(file))
  assert.equal(width * height > 0, true, 'the image has pixels')
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(data[offset + channel] - expected[channel]) > 2) {
        assert.fail(`pixel ${String(offset / 4)} of ${file} is not ${color}`)
      }
    }
  }
}

const shotsAfter = (lines: string[], from: number): Shot[] =>
  lines.slice(from).flatMap((line) => {
    const match = /^wishem-godot: shot \d+ seq (\d+) color #[0-9a-f]{6} file (.+)$/.exec(line)
    return match === null ? [] : [{ seq: Number(match[1]), file: match[2] }]
  })

await test('the Godot application draws the construct through the link', async () => {
  const lines: string[] = []
  let construct: GodotConstruct | undefined
  let run: GodotRun | undefined
  let client: RemoteLink | undefined
  try {
    // Step 1: the construct.
    construct = await startGodotConstruct({ port: 0, paused: true, log: () => undefined })
    const hubPort = Number(new URL(construct.linkUrl).port)

    // Step 2: the first picture.
    run = await runGodot({ hubPort, shotsDir: SHOTS_DIR, log: (line) => lines.push(line) })
    await waitFor('connected (link 1)', () => lines.find((line) => line.includes('connected (link 1)')))
    const first = await waitFor('shot seq 0', () => shotsAfter(lines, 0).find((shot) => shot.seq === 0))
    assertAllPixels(first.file, BLUE)

    // Step 3: one tick changes the picture.
    const channel = await webSocketChannel(new WebSocket(construct.linkUrl))
    client = await openLink(channel, [{ id: 'test-steps', kind: 'input' }])
    const result = await client.ports['test-steps'].submit(timeInputs.advance(500))
    assert.equal(result.ok, true, 'the tick is applied')
    const second = await waitFor('shot seq 1', () => shotsAfter(lines, 0).find((shot) => shot.seq === 1))
    assertAllPixels(second.file, RED)
    assert.notDeepEqual(readFileSync(second.file), readFileSync(first.file), 'the files differ')

    // Step 4: no new shot while nothing changes.
    const count = shotsAfter(lines, 0).length
    await sleep(1500)
    assert.equal(shotsAfter(lines, 0).length, count, 'no new shot')

    // Step 5: the construct ends, and the application sees the loss.
    client.close()
    client = undefined
    const lossFrom = lines.length
    await construct.close()
    await waitFor('the loss of the link', () => lines.slice(lossFrom).find((line) => line.includes('not reachable')))

    // Step 6: a new construct on the same port, and the application connects again.
    const port = hubPort
    const from = lines.length
    construct = await startGodotConstruct({ port, paused: true, log: () => undefined })
    await waitFor('connected (link 2)', () => lines.slice(from).find((line) => line.includes('connected (link 2)')))
    const again = await waitFor('shot seq 0 after link 2', () => shotsAfter(lines, from).find((shot) => shot.seq === 0))
    assertAllPixels(again.file, BLUE)

    // Step 7: the container is gone after close.
    const container = run.container
    await run.close()
    run = undefined
    const listed = execFileSync('docker', ['ps', '-a', '--filter', `name=${container}`, '--format', '{{.Names}}'], {
      encoding: 'utf8',
    })
    assert.equal(listed.trim(), '', 'no container remains')
  } finally {
    client?.close()
    await run?.close()
    await construct?.close()
  }
})
