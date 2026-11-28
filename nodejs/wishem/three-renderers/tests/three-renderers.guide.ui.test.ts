import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import type { Browser, Locator } from '@playwright/test'
import { timeInputs } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { RemoteLink } from '@thrashplay/wishem-hub'
import { runGodot } from '@thrashplay/wishem-renderer-godot'
import type { GodotRun } from '@thrashplay/wishem-renderer-godot'
import { COLORS } from '@thrashplay/wishem-sample-product'
import { PNG } from 'pngjs'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const PIXI_PAGE_DIR = join(PACKAGE_DIR, '..', 'pixi-page')
const SHOTS_DIR = join(PACKAGE_DIR, '.out', 'test-shots')
const START_MS = 60_000
const POLL_MS = 5000
const PAUSED_POLL_MS = 2000
const [BLUE, RED] = COLORS

interface Child {
  process: ChildProcess
  lines: string[]
  exited: Promise<number | null>
}

interface Shot {
  seq: number
  file: string
}

interface Renderer {
  name: string
  /** The PNG of the current picture. */
  picture(): Promise<Buffer>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async <T>(what: string, find: () => T | undefined | Promise<T | undefined>, ms: number) => {
  const deadline = Date.now() + ms
  for (;;) {
    const found = await find()
    if (found !== undefined) {
      return found
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout while waiting for: ${what}`)
    }
    await sleep(50)
  }
}

const spawnNode = (args: string[]): Child => {
  const process = spawn('node', args, { cwd: PACKAGE_DIR, stdio: ['ignore', 'pipe', 'pipe'] })
  const lines: string[] = []
  for (const input of [process.stdout, process.stderr]) {
    createInterface({ input }).on('line', (line) => lines.push(line))
  }
  const exited = new Promise<number | null>((resolve) => process.once('exit', resolve))
  return { process, lines, exited }
}

const hasExited = (child: Child) => child.process.exitCode !== null || child.process.signalCode !== null

const stopChild = async (child: Child | undefined) => {
  if (child === undefined || hasExited(child)) {
    return
  }
  child.process.kill('SIGTERM')
  await Promise.race([child.exited, sleep(10_000)])
  if (!hasExited(child)) {
    child.process.kill('SIGKILL')
    await child.exited
  }
}

/** Waits for a line of the child that matches, and returns the match. */
const waitForLine = (child: Child, what: string, pattern: RegExp) =>
  waitFor(
    what,
    () => {
      for (const line of child.lines) {
        const match = pattern.exec(line)
        if (match !== null) {
          return match
        }
      }
      return undefined
    },
    START_MS,
  )

/** True when each pixel of the PNG has the color, with at most 2 of difference in each channel. */
const isAllColor = (png: Buffer, color: string) => {
  const expected = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  const { data, width, height } = PNG.sync.read(png)
  assert.equal(width * height > 0, true, 'the image has pixels')
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(data[offset + channel] - expected[channel]) > 2) {
        return false
      }
    }
  }
  return true
}

const shotsOf = (lines: string[]): Shot[] =>
  lines.flatMap((line) => {
    const match = /^wishem-godot: shot \d+ seq (\d+) color #[0-9a-f]{6} file (.+)$/.exec(line)
    return match === null ? [] : [{ seq: Number(match[1]), file: match[2] }]
  })

/** Waits until the picture of the renderer is all of one color. Returns the picture. */
const waitForColor = (renderer: Renderer, color: string, ms: number) =>
  waitFor(
    `${renderer.name} is ${color}`,
    async () => {
      const png = await renderer.picture()
      return isAllColor(png, color) ? png : undefined
    },
    ms,
  )

await test('the three renderers draw the state of the hub', async () => {
  const godotLines: string[] = []
  let construct: Child | undefined
  let reactPage: Child | undefined
  let pixiPage: Child | undefined
  let godot: GodotRun | undefined
  let browser: Browser | undefined
  let link: RemoteLink | undefined
  try {
    // Step 1: the construct, paused.
    construct = spawnNode(['scripts/construct.ts', '--paused', '--hub-port', '0'])
    const [, linkUrl] = await waitForLine(construct, 'the link of the construct', /^wishem: link at (ws:\S+)$/)
    const hubPort = Number(new URL(linkUrl).port)

    // Step 2: the two pages.
    reactPage = spawnNode(['scripts/react-page.ts', '--port', '0', '--hub-port', String(hubPort)])
    pixiPage = spawnNode([join(PIXI_PAGE_DIR, 'scripts', 'start.ts'), '--port', '0', '--hub-port', String(hubPort)])
    const [, reactUrl] = await waitForLine(reactPage, 'the React page', /^wishem: React page at (http:\S+)$/)
    const [, pixiUrl] = await waitForLine(pixiPage, 'the PixiJS page', /^wishem: PixiJS page at (http:\S+)$/)

    // Step 3: the Godot application.
    godot = await runGodot({ hubPort, shotsDir: SHOTS_DIR, log: (line) => godotLines.push(line) })

    // Step 4: the browser, one tab for each page.
    const endpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
    assert.notEqual(endpoint, undefined, 'WISHEM_BROWSER_WS_ENDPOINT is set. Run the test with "test:ui".')
    browser = await chromium.connect(endpoint as string, { exposeNetwork: '<loopback>' })
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const reactTab = await context.newPage()
    const pixiTab = await context.newPage()
    await reactTab.goto(reactUrl)
    await pixiTab.goto(pixiUrl)
    const box: Locator = reactTab.locator('#box')
    const canvas: Locator = pixiTab.locator('canvas[data-ready]')
    for (const [name, tab] of [
      ['React', reactTab],
      ['PixiJS', pixiTab],
    ] as const) {
      await waitFor(
        `the ${name} page is connected`,
        async () => ((await tab.getByRole('status').innerText()).includes('Connected (link 1)') ? true : undefined),
        START_MS,
      )
    }
    await waitFor(
      'connected (link 1) of Godot',
      () => godotLines.find((l) => l.includes('connected (link 1)')),
      START_MS,
    )
    await waitFor('shot 1 seq 0', () => shotsOf(godotLines).find((shot) => shot.seq === 0), START_MS)

    const lastShot = () => {
      const shots = shotsOf(godotLines)
      assert.equal(shots.length > 0, true, 'Godot made a shot')
      return readFileSync(shots[shots.length - 1].file)
    }
    const react: Renderer = { name: 'the React page', picture: () => box.screenshot() }
    const pixi: Renderer = { name: 'the PixiJS page', picture: () => canvas.screenshot() }
    const godotRenderer: Renderer = { name: 'Godot', picture: () => Promise.resolve(lastShot()) }
    const renderers = [react, pixi, godotRenderer]
    const colors = (color: string, ms: number) => Promise.all(renderers.map((r) => waitForColor(r, color, ms)))

    // Step 5: a link of the test, with one input subsystem.
    const inputId = `e2e-${String(process.pid)}`
    link = await openLink(await webSocketChannel(new WebSocket(linkUrl)), [{ id: inputId, kind: 'input' }])
    const port = link.ports[inputId]
    const ticks = () => (port.read().time as { ticks: number }).ticks

    // Step 6: the first picture.
    assert.equal(ticks(), 0, 'the construct is at tick 0')
    const [reactFirst, pixiFirst, godotFirst] = await colors(BLUE, POLL_MS)

    // Step 7: one step.
    assert.equal((await port.submit(timeInputs.advance(500))).ok, true, 'the step is applied')
    const [reactRed, pixiRed, godotRed] = await colors(RED, POLL_MS)
    assert.notDeepEqual(reactRed, reactFirst, 'the React picture changed')
    assert.notDeepEqual(pixiRed, pixiFirst, 'the PixiJS picture changed')
    assert.notDeepEqual(godotRed, godotFirst, 'the Godot picture changed')

    // Step 8: no change for 1500 ms.
    const shotCount = shotsOf(godotLines).length
    await sleep(1500)
    assert.deepEqual(await react.picture(), reactRed, 'the React picture stays')
    assert.deepEqual(await pixi.picture(), pixiRed, 'the PixiJS picture stays')
    assert.equal(shotsOf(godotLines).length, shotCount, 'no new Godot shot')

    // Step 9: the clock runs, and each picture leaves red.
    assert.equal((await port.submit(timeInputs.setRunning(true))).ok, true, 'the clock runs')
    await Promise.all(
      renderers.map((renderer) =>
        waitFor(
          `${renderer.name} leaves red`,
          async () => (isAllColor(await renderer.picture(), RED) ? undefined : true),
          POLL_MS,
        ),
      ),
    )

    // Step 10: the pause, and each picture has the color of the last tick.
    assert.equal((await port.submit(timeInputs.setRunning(false))).ok, true, 'the clock stops')
    const last = ticks()
    assert.equal(last > 1, true, 'the clock made ticks')
    const [reactLast, pixiLast] = await colors(COLORS[last % COLORS.length], PAUSED_POLL_MS)
    const finalShotCount = shotsOf(godotLines).length
    await sleep(1500)
    assert.deepEqual(await react.picture(), reactLast, 'the React picture stays after the pause')
    assert.deepEqual(await pixi.picture(), pixiLast, 'the PixiJS picture stays after the pause')
    assert.equal(shotsOf(godotLines).length, finalShotCount, 'no new Godot shot after the pause')
  } finally {
    // Step 11: close in this order.
    link?.close()
    await browser?.close().catch(() => undefined)
    await godot?.close()
    await stopChild(construct)
    await stopChild(reactPage)
    await stopChild(pixiPage)
  }
})
