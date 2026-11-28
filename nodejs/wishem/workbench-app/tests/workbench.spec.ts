import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeInputs } from '@thrashplay/wishem-core'
import { hubInputs, openLink, webSocketChannel, type RecordedInput } from '@thrashplay/wishem-hub'
import { modelFolder } from '@thrashplay/wishem-workbench'

const ENTITY = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const SECOND_ENTITY = 'e_5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const SECOND_FIELD = 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03'

const model = join(import.meta.dirname, '..', '.e2e-model')
const statePath = join(model, 'state.json')
const definitionPath = join(model, 'definitions', `${APP_BAR}.json`)
const viewPath = join(import.meta.dirname, '..', 'src', 'views', 'AppBar.tsx')

/** Each entity has an `AppBar` component. A `null` title omits the field. */
const stateOf = (...entities: { id: string; title: string | null }[]) =>
  JSON.stringify({
    entities: entities.map(({ id, title }) => ({
      id,
      components: { [APP_BAR]: title === null ? {} : { [TITLE]: title } },
    })),
  })

const writeState = (text: string) => writeFile(statePath, text)

const heading = (page: Page, title: string) => page.getByRole('heading', { name: title })

const theme = ['light', 'dark'] as const

/** Opens a link whose input port records each input that the hub applies. */
const watchLink = async () => {
  const link = await openLink(await webSocketChannel(new WebSocket('ws://127.0.0.1:4180/link')), [
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

/** Selects the title with the mouse, types the new title, and presses Enter. */
const renameInPage = async (page: Page, from: string, to: string) => {
  await heading(page, from).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.keyboard.type(to)
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  // The definition first, so that each state of the files in between is correct.
  await writeFile(definitionPath, await readFile(join(modelFolder, 'definitions', `${APP_BAR}.json`)))
  await writeState(await readFile(join(modelFolder, 'state.json'), 'utf8'))
  await page.goto('/')
  await expect(heading(page, 'Wishem')).toBeVisible()
})

test('a change to the title shows with no reload', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as unknown as { kept: boolean }).kept = true
  })
  await writeState(stateOf({ id: ENTITY, title: 'Wishem workbench' }))
  await expect(heading(page, 'Wishem workbench')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true)
})

test('the removal of the entity removes the app bar and keeps the zero state', async ({ page }) => {
  await writeState(stateOf())
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByText('Nothing to show yet.')).toBeVisible()
})

test('the addition of the entity shows the app bar again', async ({ page }) => {
  await writeState(stateOf())
  await expect(page.getByRole('banner')).toHaveCount(0)
  await writeState(stateOf({ id: ENTITY, title: 'Back' }))
  await expect(heading(page, 'Back')).toBeVisible()
})

test('the heading of the app bar is inside an element that has the entity ID', async ({ page }) => {
  const marked = page.locator(`[data-wishem-entity="${ENTITY}"][data-wishem-component-type="${APP_BAR}"]`)
  await expect(marked.getByRole('heading', { name: 'Wishem' })).toBeVisible()
})

test('text that is not valid JSON keeps the title, and a correct file shows the new title', async ({ page }) => {
  await writeState('{ "entities": [')
  // Waits for the construct to read the file, so that a wrong change of the picture can show.
  await page.waitForTimeout(500)
  await expect(heading(page, 'Wishem')).toBeVisible()
  await writeState(stateOf({ id: ENTITY, title: 'Hello' }))
  await expect(heading(page, 'Hello')).toBeVisible()
})

test('two labels that give one name give one warning, and the app bar stays', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') {
      warnings.push(message.text())
    }
  })
  await writeFile(
    definitionPath,
    JSON.stringify({
      id: APP_BAR,
      label: 'AppBar',
      fields: [
        { id: TITLE, label: 'title', type: 'string' },
        { id: SECOND_FIELD, label: 'Title', type: 'string' },
      ],
    }),
  )
  await expect.poll(() => warnings.length).toBe(1)
  expect(warnings[0]).toContain('AppBar.view.json')
  expect(warnings[0]).toContain(TITLE)
  expect(warnings[0]).toContain(SECOND_FIELD)
  await expect(heading(page, 'Wishem')).toBeVisible()
})

test('a change of the label of the title field to heading empties the title, and a change back restores it', async ({
  page,
}) => {
  const definition = JSON.parse(await readFile(definitionPath, 'utf8')) as { fields: { label: string }[] }
  const relabel = (label: string) =>
    writeFile(
      definitionPath,
      JSON.stringify({ ...definition, fields: definition.fields.map((field) => ({ ...field, label })) }),
    )

  await relabel('heading')
  await expect(page.getByRole('heading')).toHaveText('.')
  await relabel('title')
  await expect(heading(page, 'Wishem')).toBeVisible()
})

test('two entities with an AppBar component give two app bars', async ({ page }) => {
  await writeState(stateOf({ id: ENTITY, title: 'First' }, { id: SECOND_ENTITY, title: 'Second' }))
  await expect(page.getByRole('banner')).toHaveCount(2)
  await expect(page.getByRole('heading')).toHaveText(['First.', 'Second.'])
})

test('no request of the page goes to a different host', async ({ page, baseURL }) => {
  const hosts = new Set<string>()
  const sockets: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('http')) {
      hosts.add(new URL(request.url()).host)
    }
  })
  page.on('websocket', (socket) => {
    sockets.push(socket.url())
  })
  await page.reload()
  await expect(heading(page, 'Wishem')).toBeVisible()
  const { host } = new URL(baseURL ?? '')
  expect([...hosts]).toEqual([host])
  // The Vite server opens its own socket for the reload of the development page.
  expect(new Set(sockets.map((url) => new URL(url).host))).toEqual(new Set([host]))
  expect(sockets.filter((url) => new URL(url).pathname === '/link')).toEqual([`ws://${host}/link`])
})

test('two pages each show the app bar and each follow a change of state.json', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto('/')
  await expect(heading(second, 'Wishem')).toBeVisible()
  await expect(heading(page, 'Wishem')).toBeVisible()
  await writeState(stateOf({ id: ENTITY, title: 'Both' }))
  await expect(heading(page, 'Both')).toBeVisible()
  await expect(heading(second, 'Both')).toBeVisible()
})

test('an input through the link shows on the page and in state.json', async ({ page }) => {
  const link = await openLink(await webSocketChannel(new WebSocket('ws://127.0.0.1:4180/link')), [
    { id: 'e2e-input', kind: 'input' },
  ])
  try {
    const result = await link.ports['e2e-input'].submit(
      storeInputs().setField({ entity: ENTITY, componentType: APP_BAR, field: TITLE, value: 'Through the link' }),
    )
    expect(result.ok).toBe(true)
    await expect(heading(page, 'Through the link')).toBeVisible()
    await expect.poll(() => readFile(statePath, 'utf8')).toContain('Through the link')
  } finally {
    link.close()
  }
})

test.describe('a change of the title in the page', () => {
  test('shows on the page and in state.json, and the hub applies it from the input subsystem of the page', async ({
    page,
  }) => {
    const { link, applied } = await watchLink()
    try {
      await renameInPage(page, 'Wishem', 'Wishem studio')
      await expect(heading(page, 'Wishem studio')).toBeVisible()
      await expect(page.getByRole('textbox')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Wishem studio' })).toBeFocused()
      await expect.poll(() => readFile(statePath, 'utf8')).toContain('Wishem studio')
      const input = applied.find((recorded) => recorded.type === 'store/set-field')
      expect(input?.source).toMatch(/^page-[0-9a-f]{16}-input$/)
    } finally {
      link.close()
    }
  })

  test('is followed by a hand edit', async ({ page }) => {
    await renameInPage(page, 'Wishem', 'Wishem studio')
    await expect(heading(page, 'Wishem studio')).toBeVisible()
    await writeState(stateOf({ id: ENTITY, title: 'Hand edit' }))
    await expect(heading(page, 'Hand edit')).toBeVisible()
  })

  test('is undone by a rewind through a client of the link', async ({ page }) => {
    const { link, port, applied } = await watchLink()
    try {
      await renameInPage(page, 'Wishem', 'Wishem studio')
      await expect(heading(page, 'Wishem studio')).toBeVisible()
      await expect.poll(() => applied.some((recorded) => recorded.type === 'store/set-field')).toBe(true)
      const change = applied.find((recorded) => recorded.type === 'store/set-field')
      const result = await port.submit(hubInputs.rewind((change?.seq ?? 1) - 1))
      expect(result.ok).toBe(true)
      await expect(heading(page, 'Wishem')).toBeVisible()
      await expect.poll(() => readFile(statePath, 'utf8')).not.toContain('Wishem studio')
      expect(await readFile(statePath, 'utf8')).toContain('"Wishem"')
    } finally {
      link.close()
    }
  })
})

test('the mark does not change the layout', async ({ page }) => {
  const box = await page.locator('header').boundingBox()
  expect(box).toEqual({ x: 0, y: 0, width: 1280, height: 48 })
})

for (const colorScheme of theme) {
  test(`the page in ${colorScheme} mode: screenshot`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.evaluate(async () => document.fonts.ready)
    await expect(page).toHaveScreenshot(`workbench-${colorScheme}.png`)
  })

  test(`the page in ${colorScheme} mode: accessibility`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('an edit to the view of the app bar shows with no restart', async ({ page }) => {
  const original = await readFile(viewPath, 'utf8')
  const edited = original.replace("title={title ?? ''}", "title='Edited view'")
  expect(edited).not.toBe(original)
  try {
    await writeFile(viewPath, edited)
    await expect(heading(page, 'Edited view')).toBeVisible()
  } finally {
    await writeFile(viewPath, original)
  }
})
