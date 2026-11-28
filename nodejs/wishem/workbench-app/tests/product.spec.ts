import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hubInputs, openLink, webSocketChannel, type RecordedInput } from '@thrashplay/wishem-hub'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'

const productFolder = join(import.meta.dirname, '..', '.e2e-product')
const statePath = join(productFolder, 'state.json')
const originalPath = join(import.meta.dirname, '..', '..', 'sample-product', 'model', 'state.json')

const theme = ['light', 'dark'] as const

const stateWithCount = (count: number) =>
  JSON.stringify({
    entities: [
      {
        id: SAMPLE_ENTITY,
        components: { [COLOR_TYPE]: { [COLOR_FIELD]: '#1d4ed8' }, [COUNTER_TYPE]: { [COUNT_FIELD]: count } },
      },
    ],
  })

/** The count in the `state.json` of the product folder. */
const countInFile = async (): Promise<unknown> => {
  const state = JSON.parse(await readFile(statePath, 'utf8')) as {
    entities: { components: Record<string, Record<string, unknown>> }[]
  }
  return state.entities[0]?.components[COUNTER_TYPE]?.[COUNT_FIELD]
}

/** Opens a link whose input port records each input that the hub applies. */
const watchLink = async () => {
  const link = await openLink(await webSocketChannel(new WebSocket('ws://127.0.0.1:4190/link')), [
    { id: 'e2e-watch', kind: 'input' },
  ])
  const port = link.ports['e2e-watch']
  const applied: RecordedInput[] = []
  port.subscribe((event) => {
    if (event.type === 'applied') {
      applied.push(event.input)
    }
  })
  return { link, port, applied }
}

const countField = (page: Page) => page.getByRole('group', { name: 'Counter' }).getByRole('textbox', { name: 'count' })

const selectSample = async (page: Page) => {
  await page.getByRole('button', { name: /Counter, Color/ }).click()
  await expect(countField(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await writeFile(statePath, await readFile(originalPath, 'utf8'))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Entities' })).toBeVisible()
  // Waits until the hub holds the first count.
  await expect.poll(countInFile).toBe(0)
})

test('the list shows the sample entity, and the inspector shows its fields', async ({ page }) => {
  await expect(page.getByText('Select an entity to change it.')).toBeVisible()
  await expect(page.getByText('Nothing to show yet.')).toHaveCount(0)
  const item = page.getByRole('button', { name: /Counter, Color/ })
  await expect(item).toContainText(SAMPLE_ENTITY.slice(0, 10))
  await item.click()
  await expect(item).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('group', { name: 'Color' }).getByRole('textbox', { name: 'color' })).toHaveValue(
    '#1d4ed8',
  )
  await expect(countField(page)).toHaveValue('0')
  await expect(page.getByText(SAMPLE_ENTITY)).toBeVisible()
})

test('a commit of the count shows in the page, in state.json, and in the record with the source of the page', async ({
  page,
}) => {
  const { link, applied } = await watchLink()
  try {
    await selectSample(page)
    await countField(page).fill('7')
    await countField(page).press('Enter')
    await expect(countField(page)).toHaveValue('7')
    await expect(page.getByText('Saving')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect.poll(countInFile).toBe(7)
    await expect.poll(() => applied.some((recorded) => recorded.type === 'product/set-field')).toBe(true)
    const input = applied.find((recorded) => recorded.type === 'product/set-field')
    expect(input?.source).toMatch(/^page-[0-9a-f]{16}-input$/)
  } finally {
    link.close()
  }
})

test('a hand edit of state.json shows with no reload', async ({ page }) => {
  await selectSample(page)
  await page.evaluate(() => {
    ;(window as unknown as { kept: boolean }).kept = true
  })
  await writeFile(statePath, stateWithCount(5))
  await expect(countField(page)).toHaveValue('5')
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true)
})

test('a rewind through a client of the link restores the value and the file', async ({ page }) => {
  const { link, port, applied } = await watchLink()
  try {
    await selectSample(page)
    await countField(page).fill('7')
    await countField(page).press('Enter')
    await expect.poll(countInFile).toBe(7)
    await expect.poll(() => applied.some((recorded) => recorded.type === 'product/set-field')).toBe(true)
    const change = applied.find((recorded) => recorded.type === 'product/set-field')
    const result = await port.submit(hubInputs.rewind((change?.seq ?? 1) - 1))
    expect(result.ok).toBe(true)
    await expect(countField(page)).toHaveValue('0')
    await expect.poll(countInFile).toBe(0)
  } finally {
    link.close()
  }
})

test('text that is not a number gives an alert and sends no input', async ({ page }) => {
  const { link, applied } = await watchLink()
  try {
    await selectSample(page)
    await countField(page).fill('ten')
    await countField(page).press('Enter')
    await expect(page.getByRole('alert')).toContainText('Type a number.')
    // Waits so that a wrong input has time to arrive.
    await page.waitForTimeout(500)
    expect(applied.filter((recorded) => recorded.type === 'product/set-field')).toEqual([])
    expect(await countInFile()).toBe(0)
  } finally {
    link.close()
  }
})

test('a viewport 390 pixels wide has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await selectSample(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

for (const colorScheme of theme) {
  test(`the page with the sample entity selected in ${colorScheme} mode: screenshot`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await selectSample(page)
    await page.evaluate(async () => document.fonts.ready)
    // The pointer stays over the item and would show its hover state.
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot(`product-${colorScheme}.png`)
  })

  test(`the page with the sample entity selected in ${colorScheme} mode: accessibility`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await selectSample(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
