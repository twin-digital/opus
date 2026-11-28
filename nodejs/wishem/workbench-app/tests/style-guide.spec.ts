import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const sections = ['principles', 'tokens', 'typography', 'components'] as const
const themes = ['light', 'dark'] as const

const GROUND = { light: 'rgb(247, 247, 250)', dark: 'rgb(18, 18, 34)' }

/**
 * Hides everything on the page except the element and its ancestors. The element then starts at the
 * same offset whatever the other sections hold, so its screenshot depends on its own content only.
 */
const isolate = async (page: Page, testId: string) => {
  await page.getByTestId(testId).evaluate((element) => {
    for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          sibling.style.display = 'none'
        }
      }
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/style-guide.html')
  await page.evaluate(async () => document.fonts.ready)
})

for (const section of sections) {
  for (const theme of themes) {
    const id = `${section}-${theme}`

    test(`${id}: screenshot`, async ({ page }) => {
      await isolate(page, id)
      await expect(page.getByTestId(id)).toHaveScreenshot(`${id}.png`)
    })

    test(`${id}: accessibility`, async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .include(`[data-testid="${id}"]`)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
    })
  }
}

test('the page requests nothing from a different host', async ({ page, baseURL }) => {
  const hosts = new Set<string>()
  page.on('request', (request) => {
    if (request.url().startsWith('http')) {
      hosts.add(new URL(request.url()).host)
    }
  })
  await page.goto('/style-guide.html')
  await page.waitForLoadState('networkidle')
  expect([...hosts]).toEqual([new URL(baseURL ?? '').host])
})

test('a dark scope in a light page has the dark value of ground', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const background = (testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await background('principles-dark')).toBe(GROUND.dark)
  expect(await background('principles-light')).toBe(GROUND.light)
})

test('a light scope in a dark page has the light value of ground', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const background = (testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await background('principles-light')).toBe(GROUND.light)
  expect(await background('principles-dark')).toBe(GROUND.dark)
})

test('the page follows the color scheme of the system, with no reload', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await background()).toBe(GROUND.light)
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await background()).toBe(GROUND.dark)
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await background()).toBe(GROUND.light)
})

test('a palette color has the same value in each theme', async ({ page }) => {
  const swatch = (testId: string) =>
    page
      .getByTestId(testId)
      .locator('[data-token="wishfire"]')
      .evaluate((e) => getComputedStyle(e).backgroundColor)
  expect(await swatch('tokens-light')).toBe('rgb(242, 169, 59)')
  expect(await swatch('tokens-dark')).toBe('rgb(242, 169, 59)')
})

test('the maker text role changes with the theme', async ({ page }) => {
  const color = (testId: string) =>
    page
      .getByTestId(testId)
      .locator('[data-token="maker-text"]')
      .evaluate((e) => getComputedStyle(e).color)
  expect(await color('tokens-light')).toBe('rgb(158, 91, 12)')
  expect(await color('tokens-dark')).toBe('rgb(242, 169, 59)')
})

test('each font face is declared once and loads from the build', async ({ page }) => {
  const faces = await page.evaluate(async () => {
    const all = Array.from(document.fonts)
    await Promise.all(all.map((face) => face.load()))
    return all.map((face) => `${face.family}|${face.style}|${face.weight}|${face.status}`).sort()
  })
  expect(faces).toEqual([
    'Bricolage Grotesque Variable|normal|200 800|loaded',
    'Inter Variable|italic|100 900|loaded',
    'Inter Variable|normal|100 900|loaded',
    'JetBrains Mono|normal|400|loaded',
    'JetBrains Mono|normal|500|loaded',
  ])
})

test('the sections are in order, each has its name, and each shows light mode then dark mode', async ({ page }) => {
  const titles = ['Principles', 'Tokens', 'Typography', 'Components']
  expect(await page.locator('main > section > h2').allTextContents()).toEqual(titles)
  for (const title of titles) {
    await expect(page.getByRole('region', { name: title, exact: true })).toHaveCount(1)
  }
  const scopes = await page.locator('main > section').evaluateAll((sections) =>
    sections.map((section) =>
      Array.from(section.querySelectorAll('[data-theme]'))
        .map((scope) => scope.getAttribute('data-theme'))
        .join(','),
    ),
  )
  expect(scopes).toEqual(titles.map(() => 'light,dark'))
})

test('a text color sample sits on ground', async ({ page }) => {
  for (const theme of themes) {
    for (const token of ['fg', 'maker-text']) {
      const sample = page.getByTestId(`tokens-${theme}`).locator(`[data-token="${token}"]`)
      expect(await sample.evaluate((e) => getComputedStyle(e).backgroundColor), `${token} in ${theme}`).toBe(
        GROUND[theme],
      )
    }
  }
})

test('the default text color is fg in each color scheme', async ({ page }) => {
  const color = () => page.evaluate(() => getComputedStyle(document.documentElement).color)
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await color()).toBe('rgb(28, 28, 46)')
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await color()).toBe('rgb(236, 236, 243)')
})

test('the typography section uses the three typefaces', async ({ page }) => {
  const family = (selector: string) =>
    page
      .getByTestId('typography-light')
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily)
  expect(await family('h1')).toMatch(/^"Bricolage Grotesque Variable"/)
  expect(await family('h2')).toMatch(/^"Bricolage Grotesque Variable"/)
  expect(await family('h3')).toMatch(/^"Bricolage Grotesque Variable"/)
  expect(await family('h4')).toMatch(/^"Inter Variable"/)
  expect(await family('p.text-body')).toMatch(/^"Inter Variable"/)
  expect(await family('pre')).toMatch(/^"JetBrains Mono"/)
})

test.describe('components section', () => {
  const specimen = (page: Page, testId: string, label: string) =>
    page.getByTestId(testId).getByRole('region', { name: label, exact: true })

  for (const theme of themes) {
    const id = `components-${theme}`

    test(`${id}: the app bar is Ink with a lowercase display title and a maker full stop`, async ({ page }) => {
      const bar = specimen(page, id, 'App bar').locator('header')
      expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 23, 42)')
      expect(await bar.evaluate((e) => getComputedStyle(e).height)).toBe('48px')
      const line = theme === 'light' ? 'rgb(222, 222, 231)' : 'rgb(45, 45, 70)'
      expect(await bar.evaluate((e) => getComputedStyle(e).borderBottomColor)).toBe(line)
      const heading = bar.locator('h1')
      const style = await heading.evaluate((e) => {
        const { fontFamily, textTransform, color } = getComputedStyle(e)
        return { fontFamily, textTransform, color }
      })
      expect(style.fontFamily).toMatch(/^"Bricolage Grotesque Variable"/)
      expect(style.textTransform).toBe('lowercase')
      expect(style.color).toBe('rgb(242, 242, 246)')
      expect(await heading.locator('span').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(242, 169, 59)')
      expect(await heading.evaluate((e) => (e as HTMLElement).innerText)).toBe('wishem.')
    })

    test(`${id}: a long title is cut with an ellipsis`, async ({ page }) => {
      const heading = specimen(page, id, 'App bar, long title').locator('h1')
      const cut = await heading.evaluate((e) => ({
        overflow: getComputedStyle(e).textOverflow,
        clipped: e.scrollWidth > e.clientWidth,
      }))
      expect(cut).toEqual({ overflow: 'ellipsis', clipped: true })
    })

    test(`${id}: the title field has the display typeface, no lowercase transform, and a maker caret`, async ({
      page,
    }) => {
      const field = specimen(page, id, 'App bar, edit').getByRole('textbox', { name: 'Title' })
      const style = await field.evaluate((e) => {
        const { fontFamily, textTransform, caretColor } = getComputedStyle(e)
        return { fontFamily, textTransform, caretColor }
      })
      expect(style.fontFamily).toMatch(/^"Bricolage Grotesque Variable"/)
      expect(style.textTransform).not.toBe('lowercase')
      expect(style.caretColor).toBe('rgb(242, 169, 59)')
      expect(await field.inputValue()).toBe('Wishem studio')
    })

    test(`${id}: the saving field is read-only and busy, and the label SAVING is in JetBrains Mono`, async ({
      page,
    }) => {
      const bar = specimen(page, id, 'App bar, saving')
      const field = bar.getByRole('textbox', { name: 'Title' })
      expect(await field.getAttribute('aria-busy')).toBe('true')
      expect(await field.evaluate((e) => (e as HTMLInputElement).readOnly)).toBe(true)
      const label = bar.getByText('Saving', { exact: true })
      expect(await label.evaluate((e) => (e as HTMLElement).innerText)).toBe('SAVING')
      expect(await label.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"JetBrains Mono"/)
    })

    test(`${id}: the line of a title that is not saved is danger-text on ground, with the role alert`, async ({
      page,
    }) => {
      const line = specimen(page, id, 'App bar, not saved').getByRole('alert')
      await expect(line).toHaveText('The title is not saved. The workbench does not run. Start it, and try again.')
      const style = await line.evaluate((e) => {
        const { color, backgroundColor } = getComputedStyle(e)
        return { color, backgroundColor }
      })
      expect(style).toEqual({
        color: theme === 'light' ? 'rgb(198, 40, 40)' : 'rgb(242, 102, 106)',
        backgroundColor: GROUND[theme],
      })
    })

    test(`${id}: the zero state is a centered mono label and text in fg-muted`, async ({ page }) => {
      const zero = specimen(page, id, 'Zero state')
      const label = zero.getByText('Workbench', { exact: true })
      const message = zero.getByText('Nothing to show yet.', { exact: true })
      const muted = theme === 'light' ? 'rgb(91, 91, 112)' : 'rgb(163, 163, 184)'
      const labelStyle = await label.evaluate((e) => {
        const { fontFamily, textTransform, color, textAlign } = getComputedStyle(e)
        return { fontFamily, textTransform, color, textAlign }
      })
      expect(labelStyle.fontFamily).toMatch(/^"JetBrains Mono"/)
      expect(labelStyle.textTransform).toBe('uppercase')
      expect(labelStyle.color).toBe(muted)
      expect(labelStyle.textAlign).toBe('center')
      expect(await message.evaluate((e) => getComputedStyle(e).color)).toBe(muted)
      expect(await message.evaluate((e) => getComputedStyle(e).textAlign)).toBe('center')
      const frame = await zero.locator('div > div').first().boundingBox()
      const text = await message.boundingBox()
      expect(frame && text && Math.abs(frame.x + frame.width / 2 - (text.x + text.width / 2))).toBeLessThan(1)
    })
  }
})

test('the default text is Inter at 16 pixels', async ({ page }) => {
  const style = await page.evaluate(() => {
    const { fontFamily, fontSize } = getComputedStyle(document.documentElement)
    return { fontFamily, fontSize }
  })
  expect(style.fontFamily).toMatch(/^"Inter Variable"/)
  expect(style.fontSize).toBe('16px')
})
