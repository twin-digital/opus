import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import type { Browser, Locator } from '@playwright/test'
import { timeInputs } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { RemoteLink } from '@thrashplay/wishem-hub'
import { runGodot } from '@thrashplay/wishem-renderer-godot'
import type { GodotRun } from '@thrashplay/wishem-renderer-godot'
import { COLORS } from '@thrashplay/wishem-sample-product'
import {
  PACKAGE_DIR,
  PIXI_PAGE_DIR,
  POLL_MS,
  START_MS,
  godotContainers,
  isAllColor,
  shotsOf,
  sizeOf,
  sleep,
  spawnNode,
  stopChild,
  waitFor,
  waitForColor,
  waitForLine,
  waitForPage,
} from './guide-helpers.ts'
import type { Child, Renderer } from './guide-helpers.ts'

const SHOTS_DIR = join(PACKAGE_DIR, '.out', 'test-shots')
const PAUSED_POLL_MS = 2000
const [BLUE, RED] = COLORS

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
    await waitForPage(reactUrl)
    await waitForPage(pixiUrl)
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
    assert.deepEqual(sizeOf(godotFirst), { width: 640, height: 360 }, 'the Godot shot is 640 by 360')

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

    // Step 12: the period key of the PixiJS page steps the three pictures.
    const isRunning = () => (port.read().time as { running: boolean }).running
    const before = ticks()
    await pixiTab.keyboard.press('.')
    await waitFor('the period key made one step', () => (ticks() === before + 1 ? true : undefined), POLL_MS)
    await colors(COLORS[(before + 1) % COLORS.length], POLL_MS)

    // Step 13: the space key runs the clock, and the space key again stops it.
    const stepped = ticks()
    await pixiTab.keyboard.press(' ')
    await waitFor('the space key runs the clock', () => (ticks() > stepped + 1 ? true : undefined), POLL_MS)
    await pixiTab.keyboard.press(' ')
    await waitFor('the space key stops the clock', () => (isRunning() ? undefined : true), POLL_MS)
    await colors(COLORS[ticks() % COLORS.length], PAUSED_POLL_MS)
    const stoppedTicks = ticks()
    await sleep(1500)
    assert.equal(ticks(), stoppedTicks, 'the clock stays stopped')
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

await test('no container of Godot is left after the test', () => {
  assert.deepEqual(godotContainers(), [])
})
