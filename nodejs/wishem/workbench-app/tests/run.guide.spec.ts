import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { constructInputs, type ConstructEntry, type ConstructList } from '@thrashplay/wishem-construct-manager'
import { openLink, webSocketChannel, type Port, type RecordedInput } from '@thrashplay/wishem-hub'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE } from '@thrashplay/wishem-sample-product'

const productFolder = join(import.meta.dirname, '..', '.e2e-run-product')
const statePath = join(productFolder, 'state.json')
const originalPath = join(import.meta.dirname, '..', '..', 'sample-product', 'model', 'state.json')
const countViewPath = join(import.meta.dirname, '..', '.e2e-run-views', 'Count.tsx')
const LINK = 'ws://127.0.0.1:4186/link'
const NO_PRODUCT_PAGE = 'http://127.0.0.1:4180/'
const CONTROLS = ['Run', 'Stop', 'Pause', 'Resume', 'Step', 'Step back']

const theme = ['light', 'dark'] as const

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const poll = async (check: () => boolean, ms = 10_000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await wait(25)
  }
}

/** A link client of the workbench, with an input port. */
const workbenchLink = async () => {
  const link = await openLink(await webSocketChannel(new WebSocket(LINK)), [{ id: 'guide', kind: 'input' }])
  const port: Port = link.ports.guide
  const entry = () => (port.read().constructs as ConstructList).constructs.play as ConstructEntry | undefined
  return { link, port, entry }
}

/** Stops `play` and restores the model of the product. */
const reset = async () => {
  const { link, port, entry } = await workbenchLink()
  try {
    if (entry() !== undefined && entry()?.status !== 'stopped') {
      await port.submit(constructInputs.stop('play'))
      await poll(() => entry()?.status === 'stopped')
    }
    await writeFile(statePath, await readFile(originalPath, 'utf8'))
    // The hub reads the file through a watcher.
    await wait(300)
  } finally {
    link.close()
  }
}

/** Starts `play` with a link client, paused at the tick 0. */
const startPaused = async () => {
  const { link, port, entry } = await workbenchLink()
  try {
    expect(await port.submit(constructInputs.start('play', { running: false }))).toMatchObject({ ok: true })
    await poll(() => entry()?.status === 'running' && entry()?.link !== undefined)
  } finally {
    link.close()
  }
}

const parts = (page: Page) => {
  const area = page.getByRole('complementary', { name: 'Run' })
  return {
    area,
    stage: area.getByRole('region', { name: 'Stage' }),
    status: area.getByRole('status'),
    picture: area.getByRole('region', { name: 'Stage' }).getByRole('img', { name: /^Color #/ }),
    control: (name: string) =>
      area.getByRole('toolbar', { name: 'Product controls' }).getByRole('button', { name, exact: true }),
    tick: async () => Number(/Tick (\d+)/.exec((await area.getByText(/^Tick \d+$/).textContent()) ?? '')?.[1]),
  }
}

const count = async (stage: Locator) => Number(/Count:? (\d+)/.exec((await stage.textContent()) ?? '')?.[1])

const expectEnabled = async (page: Page, enabled: string[]) => {
  for (const name of CONTROLS) {
    const button = parts(page).control(name)
    if (enabled.includes(name)) {
      await expect(button).not.toHaveAttribute('aria-disabled', 'true')
    } else if ((await button.count()) > 0) {
      await expect(button).toHaveAttribute('aria-disabled', 'true')
    }
  }
}

test.beforeEach(async () => {
  await reset()
})

test('step 2: the page before a run shows the run bar and the zero state of the stage', async ({ page }) => {
  await page.goto('/')
  const { status, stage, area } = parts(page)
  await expect(status).toHaveText('Not running')
  await expect(stage).toContainText('Not running. Press Run to start the product.')
  await expect(area).not.toContainText('Tick')
  await expectEnabled(page, ['Run'])
  await expect(page.getByRole('navigation', { name: 'Entities' })).toBeVisible()
})

test('steps 3, 4, 5: run, pause, step, and step back', async ({ page }) => {
  await page.goto('/')
  const { status, stage, picture, control, tick } = parts(page)
  await control('Run').click()
  await expect(status).toHaveText('Running')
  await expectEnabled(page, ['Stop', 'Pause'])
  await expect(picture).toBeVisible()
  await expect.poll(async () => count(stage)).toBeGreaterThan(10)
  expect(await tick()).toBeGreaterThan(10)

  await control('Pause').click()
  await expect(status).toHaveText('Paused')
  await expectEnabled(page, ['Stop', 'Resume', 'Step', 'Step back'])
  const pausedTick = await tick()
  const pausedCount = await count(stage)
  const pausedStage = await stage.textContent()
  await page.waitForTimeout(1000)
  expect(await tick()).toBe(pausedTick)
  expect(await stage.textContent()).toBe(pausedStage)

  await control('Step').click()
  await expect.poll(tick).toBe(pausedTick + 1)
  await expect.poll(async () => count(stage)).toBe(pausedCount + 1)
  await control('Step back').click()
  await expect.poll(tick).toBe(pausedTick)
  await expect.poll(async () => count(stage)).toBe(pausedCount)
  await expect(status).toHaveText('Paused')
})

test('steps 6, 7: an edit of the model while paused, and a hand edit while running', async ({ page }) => {
  await page.goto('/')
  const { status, stage, control, tick } = parts(page)
  await control('Run').click()
  await expect(status).toHaveText('Running')
  await control('Pause').click()
  await expect(status).toHaveText('Paused')
  const pausedTick = await tick()

  await page.getByRole('button', { name: /Counter, Color/ }).click()
  const field = page.getByRole('group', { name: 'Counter' }).getByRole('textbox', { name: 'count' })
  await field.fill('100')
  await field.press('Enter')
  await expect.poll(async () => count(stage)).toBe(100)
  expect(await tick()).toBe(pausedTick)
  await control('Step').click()
  await expect.poll(async () => count(stage)).toBe(101)
  await control('Step back').click()
  await expect.poll(async () => count(stage)).toBe(100)
  await expect(status).toHaveText('Paused')
  expect(await readFile(statePath, 'utf8')).toMatch(new RegExp(`"${COUNT_FIELD}": *100`))

  await control('Resume').click()
  await expect(status).toHaveText('Running')
  const text = await readFile(statePath, 'utf8')
  await writeFile(statePath, text.replace(new RegExp(`("${COUNT_FIELD}": *)100`), '$1500'))
  await expect.poll(async () => count(stage)).toBeGreaterThanOrEqual(500)
  await expect(status).toHaveText('Running')
})

test('step 6: a clear of the color while play is paused keeps the count and sends clear-field', async ({ page }) => {
  await page.goto('/')
  const { status, stage, control, tick } = parts(page)
  await control('Run').click()
  await expect(status).toHaveText('Running')
  await expect.poll(async () => count(stage)).toBeGreaterThan(10)
  await control('Pause').click()
  await expect(status).toHaveText('Paused')
  const pausedTick = await tick()
  const pausedCount = await count(stage)

  const { link, entry } = await workbenchLink()
  const play = await openLink(await webSocketChannel(new WebSocket(entry()?.link ?? '')), [
    { id: 'guide-play', kind: 'input' },
  ])
  const applied: RecordedInput[] = []
  play.ports['guide-play'].subscribe((event) => {
    if (event.type === 'applied') {
      applied.push(event.input)
    }
  })
  try {
    await page.getByRole('button', { name: /Counter, Color/ }).click()
    await page.getByRole('button', { name: 'Clear color', exact: true }).click()
    await expect.poll(() => applied.filter((input) => input.type === 'store/clear-field').length).toBe(1)
    const input = applied.find((recorded) => recorded.type === 'store/clear-field')
    expect(input?.source).toBe('construct-manager')
    const model = play.ports['guide-play'].read().store as {
      entities: { components: Record<string, Record<string, unknown>> }[]
    }
    const fields = model.entities[0]?.components
    expect(fields?.[COLOR_TYPE]).toEqual({})
    expect(fields?.[COLOR_TYPE]).not.toHaveProperty(COLOR_FIELD)
    expect(fields?.[COUNTER_TYPE]?.[COUNT_FIELD]).toBe(pausedCount)
    expect(applied.filter((recorded) => recorded.type === 'store/replace-model')).toHaveLength(0)
    expect(await tick()).toBe(pausedTick)
    expect(await count(stage)).toBe(pausedCount)
  } finally {
    play.close()
    link.close()
  }
})

test('step 8: a step back at the start is not enabled', async ({ page }) => {
  await startPaused()
  await page.goto('/')
  const { status, stage, picture, tick, area } = parts(page)
  await expect(status).toHaveText('Paused')
  await expect(picture).toBeVisible()
  expect(await tick()).toBe(0)
  await expect(area).toContainText('0.00 s')
  await expectEnabled(page, ['Stop', 'Resume', 'Step'])
  expect(await count(stage)).toBe(0)
})

test('step 14: the page with no product has no run area', async ({ page }) => {
  await page.goto(NO_PRODUCT_PAGE)
  await expect(page.getByRole('heading', { name: 'Wishem' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Entities' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Run' })).toHaveCount(0)
})

for (const colorScheme of theme) {
  test(`the page with play paused at the tick 0 in ${colorScheme} mode: screenshot`, async ({ page }) => {
    await startPaused()
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await expect(parts(page).picture).toBeVisible()
    await page.evaluate(async () => document.fonts.ready)
    // The pointer would show a hover state.
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot(`run-paused-${colorScheme}.png`)
  })

  for (const state of ['running', 'paused'] as const) {
    test(`the page with play ${state} in ${colorScheme} mode: accessibility`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      const { status, picture, control } = parts(page)
      await control('Run').click()
      await expect(status).toHaveText('Running')
      await expect(picture).toBeVisible()
      if (state === 'paused') {
        await control('Pause').click()
        await expect(status).toHaveText('Paused')
      }
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations).toEqual([])
    })
  }
}

test('step 12: a viewport 390 pixels wide in dark mode has the run area above the panel and no horizontal scroll', async ({
  page,
}) => {
  await startPaused()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(parts(page).picture).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const above = await page.evaluate(
    () =>
      (document.querySelector('aside[aria-label="Run"]')?.getBoundingClientRect().bottom ?? Infinity) <=
      (document.querySelector('nav[aria-label="Entities"]')?.getBoundingClientRect().top ?? 0),
  )
  expect(above).toBe(true)
  await page.evaluate(async () => document.fonts.ready)
  await page.mouse.move(0, 0)
  await expect(page).toHaveScreenshot('run-narrow-dark.png')
})

// Last: the test edits a view file of the copy in `.e2e-run-views/`, and the dev server may keep the edit until it stops.
test('step 12: an edit of a view of the product keeps the run state', async ({ page }) => {
  await startPaused()
  await page.goto('/')
  const { status, stage, tick } = parts(page)
  await expect(status).toHaveText('Paused')
  await expect(stage).toContainText('Count 0')
  const original = await readFile(countViewPath, 'utf8')
  const edited = original.replace('Count {count}', 'Count: {count}')
  expect(edited).not.toBe(original)
  try {
    await writeFile(countViewPath, edited)
    await expect(stage).toContainText('Count: 0')
    await expect(status).toHaveText('Paused')
    expect(await tick()).toBe(0)
  } finally {
    await writeFile(countViewPath, original)
  }
})
