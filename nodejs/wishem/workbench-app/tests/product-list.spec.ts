import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hubInputs, openLink, webSocketChannel, type RecordedInput } from '@thrashplay/wishem-hub'

const productFolder = join(import.meta.dirname, '..', '.e2e-list-product')
const statePath = join(productFolder, 'state.json')
const fixturePath = join(import.meta.dirname, 'fixtures', 'list-product', 'state.json')

const DECK_TYPE = 'ct_4a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const CARDS_FIELD = 'fld_5b2c3d4e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const DECK = 'e_1f2a3b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c'
const GOAT = 'e_2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d'
const OWL = 'e_3b4c5d6e-7f8a-4b9c-8d0e-2f3a4b5c6d7e'
const WOLF = 'e_4c5d6e7f-8a9b-4c0d-9e1f-3a4b5c6d7e8f'

interface State {
  entities: { id: string; components: Record<string, Record<string, unknown>> }[]
}

const readState = async () => JSON.parse(await readFile(statePath, 'utf8')) as State

/** The list of the deck in the `state.json` of the copy. */
const cardsInFile = async () => (await readState()).entities[0]?.components[DECK_TYPE]?.[CARDS_FIELD]

/** Writes the list of the deck, with each other part of the fixture state. */
const writeCards = async (cards: string[]) => {
  const state = JSON.parse(await readFile(fixturePath, 'utf8')) as State
  const deck = state.entities[0]?.components[DECK_TYPE] as Record<string, unknown> | undefined
  if (deck) {
    deck[CARDS_FIELD] = cards
  }
  await writeFile(statePath, JSON.stringify(state))
}

/** Opens a link whose input port records each input that the hub applies. */
const watchLink = async () => {
  const link = await openLink(await webSocketChannel(new WebSocket('ws://127.0.0.1:4188/link')), [
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

const cardsGroup = (page: Page) => page.getByRole('group', { name: 'Cards' })
const rows = (page: Page) => cardsGroup(page).locator('li')
const addSelect = (page: Page) => page.getByRole('combobox', { name: 'Add to Cards' })
const addButton = (page: Page) => cardsGroup(page).getByRole('button', { name: 'Add', exact: true })
const remove = (page: Page, short: string) => page.getByRole('button', { name: `Remove Card · ${short}` })

const selectDeck = async (page: Page) => {
  await page.getByRole('button', { name: /^Deck/ }).click()
  await expect(cardsGroup(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await writeFile(statePath, await readFile(fixturePath, 'utf8'))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Entities' }).getByRole('button')).toHaveCount(4)
  await expect.poll(cardsInFile).toEqual([GOAT, OWL])
})

test('the row shows the items in order, the options that the list does not hold, and the type label', async ({
  page,
}) => {
  await selectDeck(page)
  await expect(page.getByText('reference-list', { exact: true })).toBeVisible()
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toContainText(/Card\s*e_2a3b4c5d/)
  await expect(rows(page).nth(1)).toContainText(/Card\s*e_3b4c5d6e/)
  await expect(rows(page).nth(0).getByRole('button')).toHaveAccessibleName('Remove Card · e_2a3b4c5d')
  await expect(addSelect(page).locator('option')).toHaveText(['Deck · e_1f2a3b4c', 'Card · e_4c5d6e7f'])
  await expect(addButton(page)).toBeVisible()
})

test('Add gives three items, one product/add-reference with the source of the page, and the IDs in order in state.json', async ({
  page,
}) => {
  const { link, applied } = await watchLink()
  try {
    await selectDeck(page)
    await addSelect(page).selectOption(WOLF)
    await addButton(page).click()
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).nth(2)).toContainText(/Card\s*e_4c5d6e7f/)
    await expect(addSelect(page).locator('option')).toHaveText(['Deck · e_1f2a3b4c'])
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect.poll(cardsInFile).toEqual([GOAT, OWL, WOLF])
    await expect.poll(() => applied.filter((input) => input.type === 'product/add-reference').length).toBe(1)
    const input = applied.find((recorded) => recorded.type === 'product/add-reference')
    expect(input?.source).toMatch(/^page-[0-9a-f]{16}-input$/)
    expect(input?.payload).toEqual({ entity: DECK, componentType: DECK_TYPE, field: CARDS_FIELD, reference: WOLF })
  } finally {
    link.close()
  }
})

test('a write of state.json after the change in the page reverses the row with no reload', async ({ page }) => {
  const { link, applied } = await watchLink()
  try {
    await selectDeck(page)
    await addSelect(page).selectOption(WOLF)
    await addButton(page).click()
    await expect(rows(page)).toHaveCount(3)
    await expect.poll(cardsInFile).toEqual([GOAT, OWL, WOLF])
    await page.evaluate(() => {
      ;(window as unknown as { kept: boolean }).kept = true
    })
    await writeCards([WOLF, OWL, GOAT])
    await expect(rows(page).nth(0)).toContainText(/Card\s*e_4c5d6e7f/)
    await expect(rows(page).nth(1)).toContainText(/Card\s*e_3b4c5d6e/)
    await expect(rows(page).nth(2)).toContainText(/Card\s*e_2a3b4c5d/)
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true)
    expect(applied.some((input) => input.type === 'product/replace-model')).toBe(true)
  } finally {
    link.close()
  }
})

test('the store refuses to remove a card that the list names, and accepts it after Remove in the page', async ({
  page,
}) => {
  const { link, port, applied } = await watchLink()
  try {
    await writeCards([WOLF, OWL, GOAT])
    await selectDeck(page)
    await expect(rows(page)).toHaveCount(3)
    const removal = { type: 'product/remove-entity', payload: { entity: OWL } }
    const refused = await port.submit(removal)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.reason).toBe('invalid')
      const text = JSON.stringify(refused.problems)
      expect(text).toContain(DECK)
      expect(text).toContain('Cards')
      expect(text).toContain(OWL)
    }
    await expect(rows(page)).toHaveCount(3)
    await remove(page, 'e_3b4c5d6e').click()
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText(/Card\s*e_4c5d6e7f/)
    await expect(rows(page).nth(1)).toContainText(/Card\s*e_2a3b4c5d/)
    await expect(remove(page, 'e_2a3b4c5d')).toBeFocused()
    await expect.poll(() => applied.filter((input) => input.type === 'product/remove-reference').length).toBe(1)
    const input = applied.find((recorded) => recorded.type === 'product/remove-reference')
    expect(input?.source).toMatch(/^page-[0-9a-f]{16}-input$/)
    const accepted = await port.submit(removal)
    expect(accepted.ok).toBe(true)
    await expect(page.getByRole('button', { name: /^Card.*e_3b4c5d6e/ })).toHaveCount(0)
  } finally {
    link.close()
  }
})

test('a rewind before remove-reference shows the card again in the row and in state.json', async ({ page }) => {
  const { link, port, applied } = await watchLink()
  try {
    await selectDeck(page)
    await remove(page, 'e_3b4c5d6e').click()
    await expect(rows(page)).toHaveCount(1)
    await expect.poll(() => applied.filter((input) => input.type === 'product/remove-reference').length).toBe(1)
    const change = applied.find((recorded) => recorded.type === 'product/remove-reference')
    const removed = await port.submit({ type: 'product/remove-entity', payload: { entity: OWL } })
    expect(removed.ok).toBe(true)
    await expect(page.getByRole('navigation', { name: 'Entities' }).getByRole('button')).toHaveCount(3)
    const result = await port.submit(hubInputs.rewind((change?.seq ?? 1) - 1))
    expect(result.ok).toBe(true)
    await expect(page.getByRole('navigation', { name: 'Entities' }).getByRole('button')).toHaveCount(4)
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(1)).toContainText(/Card\s*e_3b4c5d6e/)
    await expect.poll(cardsInFile).toEqual([GOAT, OWL])
    expect((await readFile(statePath, 'utf8')).split(OWL)).toHaveLength(3)
  } finally {
    link.close()
  }
})

test('a duplicate in a hand edit leaves the row as it is, and a correct edit shows', async ({ page }) => {
  await selectDeck(page)
  await writeCards([GOAT, OWL, GOAT])
  // Waits so that the hub has time to read the file.
  await page.waitForTimeout(1000)
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toContainText(/Card\s*e_2a3b4c5d/)
  await expect(rows(page).nth(1)).toContainText(/Card\s*e_3b4c5d6e/)
  await writeCards([OWL])
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).nth(0)).toContainText(/Card\s*e_3b4c5d6e/)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the page with the list control in ${colorScheme} mode: accessibility`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await selectDeck(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
