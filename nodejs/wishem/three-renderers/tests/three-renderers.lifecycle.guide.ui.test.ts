import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { timeInputs } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import { COLORS } from '@thrashplay/wishem-sample-product'
import {
  GODOT_DIR,
  PIXI_PAGE_DIR,
  POLL_MS,
  START_MS,
  WORKBENCH_DIR,
  freePort,
  godotContainers,
  interrupt,
  shotsOf,
  sleep,
  spawnNode,
  stopChild,
  waitFor,
  waitForColor,
  waitForLine,
  waitForPage,
} from './guide-helpers.ts'
import type { Child, Renderer } from './guide-helpers.ts'

// Steps 3-5 and 14-20 of the test guide: the parts start in any order, the construct stops and starts, and each part ends on SIGINT.
const [BLUE, RED] = COLORS
const UNREACHABLE = 'The construct is not reachable. The page tries again.'

const statusOf = (tab: Page) => tab.getByRole('status').innerText()

const waitForStatus = (name: string, tab: Page, text: string) =>
  waitFor(
    `the ${name} page says "${text}"`,
    async () => ((await statusOf(tab)).includes(text) ? true : undefined),
    START_MS,
  )

await test('the parts wait for the construct, survive its stop, and end on SIGINT', async () => {
  const hubPort = await freePort()
  const hubArgs = ['--hub-port', String(hubPort)]
  let construct: Child | undefined
  let second: Child | undefined
  let reactPage: Child | undefined
  let pixiPage: Child | undefined
  let godot: Child | undefined
  let workbench: Child | undefined
  let browser: Browser | undefined
  try {
    // Steps 3-5: the pages and Godot start with no construct.
    reactPage = spawnNode(['scripts/react-page.ts', '--port', '0', ...hubArgs])
    pixiPage = spawnNode([`${PIXI_PAGE_DIR}/scripts/start.ts`, '--port', '0', ...hubArgs])
    godot = spawnNode(['scripts/godot.ts', 'run', ...hubArgs], GODOT_DIR)
    const [, reactUrl] = await waitForLine(reactPage, 'the React page', /^wishem: React page at (http:\S+)$/)
    const [, pixiUrl] = await waitForLine(pixiPage, 'the PixiJS page', /^wishem: PixiJS page at (http:\S+)$/)
    await waitForLine(
      reactPage,
      'the React link line',
      new RegExp(`^wishem: the page connects to ws:\\S+:${String(hubPort)}/link$`),
    )
    await waitForLine(
      pixiPage,
      'the PixiJS link line',
      new RegExp(`^wishem: the page connects to ws:\\S+:${String(hubPort)}/link$`),
    )
    await waitForLine(
      godot,
      'Godot connecting',
      new RegExp(`^wishem-godot: connecting to ws:\\S+:${String(hubPort)}/link$`),
    )

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
    await waitForStatus('React', reactTab, UNREACHABLE)
    await waitForStatus('PixiJS', pixiTab, UNREACHABLE)
    await waitForLine(
      godot,
      'Godot cannot reach the hub',
      /^wishem-godot: the hub is not reachable\. Godot tries again\.$/,
    )
    await reactTab.evaluate(() => {
      ;(window as unknown as { marker: number }).marker = 1
    })
    await pixiTab.evaluate(() => {
      ;(window as unknown as { marker: number }).marker = 1
    })
    const marked = (tab: Page) => tab.evaluate(() => (window as unknown as { marker?: number }).marker)

    const react: Renderer = { name: 'the React page', picture: () => reactTab.locator('#box').screenshot() }
    const pixi: Renderer = {
      name: 'the PixiJS page',
      picture: () => pixiTab.locator('canvas[data-ready]').screenshot(),
    }
    const godotRenderer: Renderer = {
      name: 'Godot',
      picture: () => {
        const shots = shotsOf(godot?.lines ?? [])
        return Promise.resolve(readFileSync(shots[shots.length - 1].file))
      },
    }
    const renderers = [react, pixi, godotRenderer]
    const colors = (color: string, ms: number) => Promise.all(renderers.map((r) => waitForColor(r, color, ms)))
    const shotCount = () => shotsOf(godot?.lines ?? []).length

    // Step 6 (guide): the construct starts, and each part connects.
    construct = spawnNode(['scripts/construct.ts', '--paused', ...hubArgs])
    const [, linkUrl] = await waitForLine(construct, 'the link of the construct', /^wishem: link at (ws:\S+)$/)
    await waitForStatus('React', reactTab, 'Connected (link 1)')
    await waitForStatus('PixiJS', pixiTab, 'Connected (link 1)')
    await waitForLine(godot, 'Godot connected (link 1)', /^wishem-godot: connected \(link 1\)$/)
    await waitFor('the first Godot shot', () => shotsOf(godot?.lines ?? []).find((shot) => shot.seq === 0), START_MS)
    await colors(BLUE, POLL_MS)

    // Step 14: a step to red, then SIGINT of the construct. Exit code 0, and each picture keeps red.
    const inputId = 'e2e-lifecycle'
    const link = await openLink(await webSocketChannel(new WebSocket(linkUrl)), [{ id: inputId, kind: 'input' }])
    assert.equal((await link.ports[inputId].submit(timeInputs.advance(500))).ok, true, 'the step is applied')
    await colors(RED, POLL_MS)
    link.close()
    const lostAt = godot.lines.length
    assert.equal(await interrupt(construct), 0, 'the construct ends with exit code 0 on SIGINT')
    await waitForStatus('React', reactTab, UNREACHABLE)
    await waitForStatus('PixiJS', pixiTab, UNREACHABLE)
    const shotsAtLoss = shotCount()
    await sleep(1500)
    await Promise.all(renderers.map((r) => waitForColor(r, RED, 500)))
    assert.equal(shotCount(), shotsAtLoss, 'no new Godot shot after the loss')
    await waitForLine(
      godot,
      'Godot reports the loss',
      /^wishem-godot: the hub is not reachable\. Godot tries again\.$/,
      lostAt,
    )

    // Step 15: the construct starts again on the same port. Link 2, blue, no page reload.
    const beforeRestart = godot.lines.length
    construct = spawnNode(['scripts/construct.ts', '--paused', ...hubArgs])
    await waitForLine(construct, 'the link of the second construct', /^wishem: link at ws:/)
    await waitForStatus('React', reactTab, 'Connected (link 2)')
    await waitForStatus('PixiJS', pixiTab, 'Connected (link 2)')
    await waitForLine(godot, 'Godot connected (link 2)', /^wishem-godot: connected \(link 2\)$/, beforeRestart)
    await waitForLine(godot, 'the Godot shot seq 0', /^wishem-godot: shot \d+ seq 0 color #1d4ed8 /, beforeRestart)
    await colors(BLUE, POLL_MS)
    assert.equal(await marked(reactTab), 1, 'the React page did not reload')
    assert.equal(await marked(pixiTab), 1, 'the PixiJS page did not reload')

    // Step 16: a second construct on the same port ends with exit code 1.
    second = spawnNode(['scripts/construct.ts', ...hubArgs])
    assert.equal(await second.exited, 1, 'the second construct ends with exit code 1')
    assert.equal(
      second.lines.includes(`wishem: port ${String(hubPort)} is in use`),
      true,
      'the second construct says the port is in use',
    )
    await colors(BLUE, POLL_MS)

    // Step 17: the workbench starts on other ports and changes no picture.
    workbench = spawnNode(['scripts/start.ts', '--port', '0', '--hub-port', '0', '--no-view-types'], WORKBENCH_DIR)
    const [, workbenchLink] = await waitForLine(workbench, 'the link of the workbench', /^wishem: link at (ws:\S+)$/)
    assert.notEqual(new URL(workbenchLink).port, String(hubPort), 'the workbench uses its own port')
    const workbenchShots = shotCount()
    await sleep(1500)
    await colors(BLUE, POLL_MS)
    assert.equal(shotCount(), workbenchShots, 'no new Godot shot')
    assert.equal(await interrupt(workbench), 0, 'the workbench ends with exit code 0 on SIGINT')

    // Step 18: Godot ends with exit code 0, and no container is left.
    assert.equal(await interrupt(godot), 0, 'Godot ends with exit code 0 on SIGINT')
    assert.deepEqual(godotContainers(), [], 'no container of Godot is left')

    // Step 19: the pages end with exit code 0, and the construct still runs.
    assert.equal(await interrupt(pixiPage), 0, 'the PixiJS page ends with exit code 0 on SIGINT')
    assert.equal(await interrupt(reactPage), 0, 'the React page ends with exit code 0 on SIGINT')
    const check = await openLink(await webSocketChannel(new WebSocket(linkUrl)), [{ id: inputId, kind: 'input' }])
    assert.equal((await check.ports[inputId].submit(timeInputs.advance(500))).ok, true, 'the construct still runs')
    check.close()

    // Step 20: the construct ends with exit code 0.
    assert.equal(await interrupt(construct), 0, 'the construct ends with exit code 0 on SIGINT')
  } finally {
    await browser?.close().catch(() => undefined)
    for (const child of [workbench, second, godot, construct, reactPage, pixiPage]) {
      await stopChild(child)
    }
  }
  assert.deepEqual(godotContainers(), [], 'no container of Godot is left after the test')
})
