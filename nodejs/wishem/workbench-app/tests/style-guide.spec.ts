import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

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

/**
 * Makes the viewport as high as the element. An open menu then has room below its trigger,
 * so it opens at the same place whatever the scroll position is.
 */
const fitViewport = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).evaluate((element) => {
    const { top, height } = element.getBoundingClientRect()
    return { top: top + window.scrollY, height }
  })
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: Math.ceil(box.top + box.height) })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  // Two frames let the open menus find their place after the resize.
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      }),
  )
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
      await fitViewport(page, id)
      await expect(page.getByTestId(id)).toHaveScreenshot(`${id}.png`)
    })

    test(`${id}: accessibility`, async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .include(`[data-testid="${id}"]`)
        // Base UI draws these focus guards in an open menu. They are hidden and focusable by design.
        .exclude('[data-base-ui-focus-guard]')
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

test('the swatch of on-fill has the color of night in each theme', async ({ page }) => {
  for (const theme of themes) {
    const swatch = page.getByTestId(`tokens-${theme}`).locator('[data-token="on-fill"]')
    expect(await swatch.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(23, 23, 42)')
  }
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

/** The style properties that the states of a control change. */
const lookOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const {
      borderColor,
      borderStyle,
      boxShadow,
      outlineStyle,
      outlineWidth,
      outlineColor,
      outlineOffset,
      backgroundColor,
      color,
      filter,
      transform,
      translate,
    } = getComputedStyle(element)
    return {
      borderColor,
      borderStyle,
      boxShadow,
      outlineStyle,
      outlineWidth,
      outlineColor,
      outlineOffset,
      backgroundColor,
      color,
      filter,
      transform,
      translate,
    }
  })

/**
 * Moves focus to the element with the Tab key. A click on the Zero state first sets the start of the Tab order.
 */
const tabTo = async (page: Page, scope: Locator, target: Locator) => {
  await scope.getByRole('region', { name: 'Zero state', exact: true }).click()
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) {
      return
    }
  }
  throw new Error('The Tab key did not reach the target')
}

const DANGER_TEXT = { light: 'rgb(198, 40, 40)', dark: 'rgb(242, 102, 106)' }
const MAKER_TEXT = { light: 'rgb(158, 91, 12)', dark: 'rgb(242, 169, 59)' }
const CONTROL_BORDER = { light: 'rgb(133, 133, 154)', dark: 'rgb(107, 107, 136)' }

test.describe('button, text controls, and checkbox', () => {
  for (const theme of themes) {
    const scope = (page: Page) => page.getByTestId(`components-${theme}`)
    const within = (page: Page, specimen: string, role: 'button' | 'textbox' | 'checkbox') =>
      scope(page).getByTestId(specimen).getByRole(role)

    for (const variant of ['maker', 'neutral', 'quiet', 'danger']) {
      test(`${theme}: the real hover and the real focus of a ${variant} button have the style of the forced states`, async ({
        page,
      }) => {
        const forcedHover = await lookOf(within(page, `button-${variant}-hover`, 'button'))
        const forcedFocus = await lookOf(within(page, `button-${variant}-focus`, 'button'))
        const normal = within(page, `button-${variant}-default`, 'button')
        await normal.hover()
        expect(await lookOf(normal)).toEqual(forcedHover)
        await page.mouse.move(0, 0)
        await tabTo(page, scope(page), normal)
        expect(await lookOf(normal)).toEqual(forcedFocus)
        expect(forcedFocus.outlineColor).toBe(MAKER_TEXT[theme])
        expect(forcedFocus.outlineWidth).toBe('2px')
        expect(forcedFocus.outlineOffset).toBe('2px')
      })
    }

    test(`${theme}: the forced states of a button differ from the default`, async ({ page }) => {
      const base = await lookOf(within(page, 'button-maker-default', 'button'))
      expect((await lookOf(within(page, 'button-maker-hover', 'button'))).filter).not.toBe(base.filter)
      expect((await lookOf(within(page, 'button-maker-active', 'button'))).translate).not.toBe(base.translate)
      expect((await lookOf(within(page, 'button-maker-focus', 'button'))).outlineStyle).not.toBe(base.outlineStyle)
    })

    test(`${theme}: the neutral button has a border in control-border`, async ({ page }) => {
      const look = await lookOf(within(page, 'button-neutral-default', 'button'))
      expect(look.borderColor).toBe(CONTROL_BORDER[theme])
    })

    test(`${theme}: a button and a checkbox show no ring after a click`, async ({ page }) => {
      const button = within(page, 'button-neutral-default', 'button')
      await button.click()
      await expect(button).toBeFocused()
      expect((await lookOf(button)).outlineStyle).toBe('none')
      const box = within(page, 'checkbox-off-default', 'checkbox')
      await box.click({ force: true })
      await expect(box).toBeFocused()
      expect((await lookOf(box)).outlineStyle).toBe('none')
    })

    test(`${theme}: the Space key changes a checkbox`, async ({ page }) => {
      const box = within(page, 'checkbox-off-default', 'checkbox')
      await box.focus()
      await box.evaluate((element) => {
        element.addEventListener('click', () => {
          element.setAttribute('data-click-checked', String((element as HTMLInputElement).checked))
        })
      })
      await page.keyboard.press('Space')
      await expect(box).toHaveAttribute('data-click-checked', 'true')
    })

    test(`${theme}: a loading danger button has the colors of the default danger button`, async ({ page }) => {
      const loading = await lookOf(within(page, 'button-danger-loading', 'button'))
      const normal = await lookOf(within(page, 'button-danger-default', 'button'))
      expect(loading.backgroundColor).toBe(normal.backgroundColor)
      expect(loading.color).toBe(normal.color)
    })

    test(`${theme}: a loading button gets focus with the Tab key`, async ({ page }) => {
      const loading = within(page, 'button-maker-loading', 'button')
      await tabTo(page, scope(page), loading)
      await expect(loading).toBeFocused()
      expect((await lookOf(loading)).outlineStyle).toBe('solid')
    })

    for (const id of ['text-input', 'text-input-empty', 'text-area']) {
      test(`${theme}: the real hover and the real focus of ${id} have the style of the forced states`, async ({
        page,
      }) => {
        const forcedHover = await lookOf(within(page, `${id}-hover`, 'textbox'))
        const forcedFocus = await lookOf(within(page, `${id}-focus`, 'textbox'))
        const normal = within(page, `${id}-default`, 'textbox')
        await normal.hover()
        expect(await lookOf(normal)).toEqual(forcedHover)
        await page.mouse.move(0, 0)
        await tabTo(page, scope(page), normal)
        expect(await lookOf(normal)).toEqual(forcedFocus)
      })
    }

    test(`${theme}: a text input shows the focus look after a click and keeps its size`, async ({ page }) => {
      const input = within(page, 'text-input-default', 'textbox')
      const size = async () => {
        const box = await input.boundingBox()
        return { width: box?.width, height: box?.height }
      }
      const before = await size()
      await input.click()
      await expect(input).toBeFocused()
      const look = await lookOf(input)
      expect(look.borderColor).toBe(MAKER_TEXT[theme])
      expect(look.boxShadow).toContain(MAKER_TEXT[theme])
      expect(look.outlineWidth).toBe('0px')
      expect(await size()).toEqual(before)
    })

    test(`${theme}: an error text control keeps the danger-text border in the real hover and the real focus`, async ({
      page,
    }) => {
      const error = within(page, 'text-input-error', 'textbox')
      expect((await lookOf(error)).borderColor).toBe(DANGER_TEXT[theme])
      await error.hover()
      expect((await lookOf(error)).borderColor).toBe(DANGER_TEXT[theme])
      await error.focus()
      const focused = await lookOf(error)
      expect(focused.borderColor).toBe(DANGER_TEXT[theme])
      expect(focused.boxShadow).toContain(DANGER_TEXT[theme])
    })

    test(`${theme}: the specimen error with focus has the danger-text border and inner pixel`, async ({ page }) => {
      const look = await lookOf(within(page, 'text-input-error-focus', 'textbox'))
      expect(look.borderColor).toBe(DANGER_TEXT[theme])
      expect(look.boxShadow).toContain(DANGER_TEXT[theme])
    })

    test(`${theme}: the read-only control has a dashed border and no fill`, async ({ page }) => {
      const look = await lookOf(within(page, 'text-input-read-only', 'textbox'))
      expect(look.borderStyle).toBe('dashed')
      expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    })

    for (const state of ['off', 'on']) {
      test(`${theme}: the real hover and the real focus of the ${state} checkbox have the style of the forced states`, async ({
        page,
      }) => {
        const forcedHover = await lookOf(within(page, `checkbox-${state}-hover`, 'checkbox'))
        const forcedFocus = await lookOf(within(page, `checkbox-${state}-focus`, 'checkbox'))
        const normal = within(page, `checkbox-${state}-default`, 'checkbox')
        await normal.hover()
        expect(await lookOf(normal)).toEqual(forcedHover)
        await page.mouse.move(0, 0)
        await tabTo(page, scope(page), normal)
        expect(await lookOf(normal)).toEqual(forcedFocus)
      })
    }

    test(`${theme}: a long checkbox label wraps and the box stays at the first line`, async ({ page }) => {
      const specimen = scope(page).getByTestId('checkbox-long')
      const box = await specimen.getByRole('checkbox').boundingBox()
      const text = specimen.locator('label > span')
      const textBox = await text.boundingBox()
      const lineHeight = await text.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight))
      expect(textBox?.height).toBeGreaterThan(lineHeight * 1.5)
      expect(box && textBox && box.y - textBox.y).toBeLessThan(lineHeight)
      expect(box?.height).toBe(16)
      const frame = await specimen.boundingBox()
      expect(frame && textBox && textBox.x + textBox.width).toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0))
    })

    test(`${theme}: a click on the label of a field moves focus to the text input`, async ({ page }) => {
      const field = scope(page).getByTestId('text-input-error')
      await field.getByText('Speed', { exact: true }).click()
      await expect(field.getByRole('textbox')).toBeFocused()
    })
  }
})

test.describe('select', () => {
  const SURFACE = { light: 'rgb(255, 255, 255)', dark: 'rgb(27, 27, 48)' }

  for (const theme of themes) {
    const scope = (page: Page) => page.getByTestId(`components-${theme}`)
    const trigger = (page: Page, specimen: string) => scope(page).getByTestId(specimen).getByRole('combobox')

    test(`${theme}: the real hover has the style of the forced hover`, async ({ page }) => {
      const forced = await lookOf(trigger(page, 'select-hover'))
      await trigger(page, 'select-default').hover()
      expect(await lookOf(trigger(page, 'select-default'))).toEqual(forced)
    })

    test(`${theme}: the real focus has the style of the forced focus`, async ({ page }) => {
      const forced = await lookOf(trigger(page, 'select-focus'))
      await tabTo(page, scope(page), trigger(page, 'select-default'))
      await expect(trigger(page, 'select-default')).toBeFocused()
      expect(await lookOf(trigger(page, 'select-default'))).toEqual(forced)
    })

    test(`${theme}: an error select keeps the danger-text border in the real hover and the real focus`, async ({
      page,
    }) => {
      const error = trigger(page, 'select-error')
      expect((await lookOf(error)).borderColor).toBe(DANGER_TEXT[theme])
      await error.hover()
      expect((await lookOf(error)).borderColor).toBe(DANGER_TEXT[theme])
      await error.focus()
      const focused = await lookOf(error)
      expect(focused.borderColor).toBe(DANGER_TEXT[theme])
      expect(focused.boxShadow).toContain(DANGER_TEXT[theme])
    })

    test(`${theme}: an open select has the focus look while the pointer stays on it`, async ({ page }) => {
      const button = trigger(page, 'select-default')
      await button.click()
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await expect(button).not.toBeFocused()
      await button.hover()
      expect(await button.evaluate((element) => element.matches(':hover'))).toBe(true)
      const look = await lookOf(button)
      expect(look.borderColor).toBe(MAKER_TEXT[theme])
      expect(look.boxShadow).toContain(MAKER_TEXT[theme])
    })

    test(`${theme}: an open error select keeps the danger-text border while the pointer stays on it`, async ({
      page,
    }) => {
      const error = trigger(page, 'select-error')
      await error.click()
      await expect(error).toHaveAttribute('aria-expanded', 'true')
      await expect(error).not.toBeFocused()
      await error.hover()
      expect(await error.evaluate((element) => element.matches(':hover'))).toBe(true)
      const look = await lookOf(error)
      expect(look.borderColor).toBe(DANGER_TEXT[theme])
      expect(look.boxShadow).toContain(DANGER_TEXT[theme])
    })

    test(`${theme}: the page scrolls with the menus open`, async ({ page }) => {
      await page.evaluate(() => {
        window.scrollTo(0, 200)
      })
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      expect(
        await page.evaluate(() => [document.body, document.documentElement].map((e) => getComputedStyle(e).overflow)),
      ).not.toContain('hidden')
    })

    test(`${theme}: the forced states differ from the default`, async ({ page }) => {
      const base = await lookOf(trigger(page, 'select-default'))
      expect((await lookOf(trigger(page, 'select-hover'))).borderColor).not.toBe(base.borderColor)
      expect((await lookOf(trigger(page, 'select-focus'))).boxShadow).not.toBe(base.boxShadow)
    })

    test(`${theme}: the keyboard opens, moves, selects, and closes`, async ({ page }) => {
      const button = trigger(page, 'select-default')
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      const list = page.locator(`[id="${await button.getAttribute('aria-controls')}"]`)
      const highlighted = list.locator('[role="option"][data-highlighted]')
      await expect(highlighted).toHaveText('Enemy')
      await page.keyboard.press('ArrowDown')
      await expect(highlighted).toHaveText('Prop')
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(button).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(button).toBeFocused()
    })

    test(`${theme}: the open menus are in the scope, with the surface of the scope`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
      const menus = scope(page).locator('[role="listbox"]')
      await expect(menus).toHaveCount(4)
      for (const menu of await menus.all()) {
        expect(await menu.evaluate((e) => getComputedStyle(e.parentElement as HTMLElement).backgroundColor)).toBe(
          SURFACE[theme],
        )
      }
    })

    test(`${theme}: a long value is cut and the menu is as wide as the trigger`, async ({ page }) => {
      const narrow = scope(page).getByTestId('select-narrow').getByRole('combobox')
      const value = narrow.locator('span').first()
      expect(
        await value.evaluate((e) => ({
          overflow: getComputedStyle(e).textOverflow,
          cut: e.scrollWidth > e.clientWidth,
        })),
      ).toEqual({
        overflow: 'ellipsis',
        cut: true,
      })
      const triggerBox = await narrow.boundingBox()
      const option = scope(page).getByRole('option', { name: /^A long option/ })
      const menuBox = await option.evaluate((e) => {
        const listbox = e.closest('[role="listbox"]') as HTMLElement
        const { width } = (listbox.parentElement as HTMLElement).getBoundingClientRect()
        return width
      })
      expect(Math.abs((triggerBox?.width ?? 0) - menuBox)).toBeLessThan(1)
      const lineHeight = await option.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight))
      expect((await option.boundingBox())?.height).toBeGreaterThan(lineHeight * 1.5)
    })

    test(`${theme}: a click on the label of a field moves focus to the select and keeps its menu closed`, async ({
      page,
    }) => {
      const field = scope(page).getByTestId('select-error')
      const button = field.getByRole('combobox')
      await expect(button).toHaveAccessibleName('Kind')
      await field.getByText('Kind', { exact: true }).click()
      await expect(button).toBeFocused()
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(await page.locator(`[id="${(await button.getAttribute('aria-controls')) ?? ''}"]`).count()).toBe(0)
    })

    /** Scrolls the page so that the trigger is `top` pixels from the top edge of the viewport. */
    const placeTrigger = async (page: Page, button: Locator, top: number) => {
      await button.evaluate((element, wanted) => {
        window.scrollBy(0, element.getBoundingClientRect().top - wanted)
      }, top)
    }

    /**
     * Opens the select and returns the boxes of the trigger and the menu, and the viewport.
     * The open specimens of the page take focus and scroll the page, so the trigger returns to `top` first.
     */
    const openAndMeasure = async (page: Page, button: Locator, top: number) => {
      await button.click()
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await page.waitForTimeout(300)
      await placeTrigger(page, button, top)
      const list = page.locator(`[id="${(await button.getAttribute('aria-controls')) ?? ''}"]`)
      await expect(list).toBeVisible()
      // The menu animates in. Wait until its box stops moving.
      await expect
        .poll(async () => {
          const first = await list.boundingBox()
          await page.waitForTimeout(50)
          const second = await list.boundingBox()
          return JSON.stringify(first) === JSON.stringify(second)
        })
        .toBe(true)
      return page.evaluate(
        ([triggerId, listId]) => {
          const box = (element: Element | null) => {
            const { top, bottom, left, right } = (element as HTMLElement).getBoundingClientRect()
            return { top, bottom, left, right }
          }
          const list = document.getElementById(listId) as HTMLElement
          const menu = list.closest('[data-side]') ?? list.parentElement
          return {
            trigger: box(document.getElementById(triggerId)),
            menu: box(menu),
            scrolls: list.scrollHeight > list.clientHeight + 1,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          }
        },
        [(await button.getAttribute('id')) ?? '', (await button.getAttribute('aria-controls')) ?? ''],
      )
    }

    test(`${theme}: a menu that does not fit below the trigger opens above it, inside the viewport`, async ({
      page,
    }) => {
      const button = trigger(page, 'select-default')
      const height = page.viewportSize()?.height ?? 720
      await placeTrigger(page, button, height - 60)
      const m = await openAndMeasure(page, button, height - 60)
      expect(m.menu.top).toBeGreaterThanOrEqual(0)
      expect(m.menu.bottom).toBeLessThanOrEqual(m.viewport.height)
      expect(m.menu.bottom).toBeLessThanOrEqual(m.trigger.top)
    })

    test(`${theme}: a menu that fits below the trigger opens below it, 4 pixels from it`, async ({ page }) => {
      const button = trigger(page, 'select-default')
      await placeTrigger(page, button, 20)
      const m = await openAndMeasure(page, button, 20)
      expect(m.menu.top).toBeGreaterThanOrEqual(m.trigger.bottom)
      expect(Math.abs(m.menu.top - m.trigger.bottom - 4)).toBeLessThan(1)
      expect(m.menu.bottom).toBeLessThanOrEqual(m.viewport.height)
      expect(Math.abs(m.menu.left - m.trigger.left)).toBeLessThan(1)
      expect(Math.abs(m.menu.right - m.trigger.right)).toBeLessThan(1)
    })

    test(`${theme}: a menu that fits on neither side uses the larger side, and its list scrolls`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 150 })
      const button = trigger(page, 'select-default')
      await placeTrigger(page, button, 30)
      const m = await openAndMeasure(page, button, 30)
      expect(m.menu.top).toBeGreaterThanOrEqual(0)
      expect(m.menu.bottom).toBeLessThanOrEqual(m.viewport.height)
      expect(m.scrolls).toBe(true)
    })
  }
})

test.describe('prompt box', () => {
  for (const theme of themes) {
    const scope = (page: Page) => page.getByTestId(`components-${theme}`)
    const area = (page: Page, specimen: string) => scope(page).getByTestId(specimen).getByRole('textbox')
    const box = (page: Page, specimen: string) => scope(page).getByTestId(specimen).getByRole('group')

    test(`${theme}: the real focus of the empty box has the look of the forced box`, async ({ page }) => {
      const forced = await lookOf(box(page, 'prompt-focus'))
      await tabTo(page, scope(page), area(page, 'prompt-empty'))
      const real = await lookOf(box(page, 'prompt-empty'))
      expect(real).toEqual(forced)
      expect(real.borderColor).toBe(MAKER_TEXT[theme])
      expect(real.boxShadow).toContain(MAKER_TEXT[theme])
    })

    test(`${theme}: the button of the forced box has no focus ring`, async ({ page }) => {
      const button = scope(page).getByTestId('prompt-focus').getByRole('button')
      expect((await lookOf(button)).outlineStyle).toBe('none')
    })

    test(`${theme}: the working box has the spirit border`, async ({ page }) => {
      const look = await lookOf(box(page, 'prompt-working'))
      expect(look.borderColor).toBe('rgb(127, 214, 198)')
    })

    const heightOf = (page: Page, lines: number) =>
      area(page, 'prompt-empty').evaluate((element, count) => {
        const field = element as HTMLTextAreaElement
        field.value = Array.from({ length: count }, (_, index) => `line ${String(index + 1)}`).join('\n')
        field.dispatchEvent(new Event('input', { bubbles: true }))
        const lineHeight = parseFloat(getComputedStyle(field).lineHeight)
        return {
          lines: Math.round(field.getBoundingClientRect().height / lineHeight),
          scrolls: field.scrollHeight > field.clientHeight + 1,
        }
      }, lines)

    test(`${theme}: five lines make a text area of five lines with no scroll bar`, async ({ page }) => {
      expect(await heightOf(page, 5)).toEqual({ lines: 5, scrolls: false })
    })

    test(`${theme}: twelve lines make a text area of eight lines that scrolls`, async ({ page }) => {
      expect(await heightOf(page, 12)).toEqual({ lines: 8, scrolls: true })
    })

    test(`${theme}: an empty box is three lines high`, async ({ page }) => {
      expect(await heightOf(page, 1)).toEqual({ lines: 3, scrolls: false })
    })

    test(`${theme}: in the narrow box the button is fully inside the box`, async ({ page }) => {
      const narrow = box(page, 'prompt-narrow')
      const frame = await narrow.boundingBox()
      const button = await narrow.getByRole('button').boundingBox()
      expect(button?.x).toBeGreaterThanOrEqual(frame?.x ?? 0)
      expect((button?.x ?? 0) + (button?.width ?? 0)).toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0))
      const hint = await narrow.getByText('Enter to send', { exact: false }).boundingBox()
      expect(button?.y).toBeGreaterThanOrEqual((hint?.y ?? 0) + (hint?.height ?? 0) - 1)
    })

    test(`${theme}: the disabled box shows the reason at full fg-muted`, async ({ page }) => {
      const reason = scope(page).getByTestId('prompt-disabled').getByText('Not connected', { exact: true })
      expect(await reason.evaluate((e) => getComputedStyle(e).opacity)).toBe('1')
      expect(await reason.evaluate((e) => getComputedStyle(e).color)).toBe(
        theme === 'light' ? 'rgb(91, 91, 112)' : 'rgb(163, 163, 184)',
      )
    })

    test(`${theme}: Tab skips the disabled box and the box shows no focus look`, async ({ page }) => {
      const box = scope(page).getByTestId('prompt-disabled')
      const send = box.getByRole('button', { name: 'Make a wish' })
      await send.evaluate((element) => {
        const probe = document.createElement('button')
        probe.setAttribute('data-probe', '')
        element.closest('[data-testid="prompt-disabled"]')?.prepend(probe)
        probe.focus()
      })
      await page.keyboard.press('Tab')
      await expect(send).not.toBeFocused()
      await expect(box.locator(':focus-within')).toHaveCount(0)
      await box.locator('[data-probe]').evaluate((element) => {
        element.remove()
      })
    })
  }
})

test('the page is at the top after it loads, although the open menus take focus', async ({ page }) => {
  await expect(page.locator('[role="option"]:focus')).toHaveCount(1)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const highest = await page.evaluate(
    async () =>
      new Promise<number>((resolve) => {
        const end = performance.now() + 500
        let max = window.scrollY
        const sample = () => {
          max = Math.max(max, window.scrollY)
          if (performance.now() < end) {
            requestAnimationFrame(sample)
          } else {
            resolve(max)
          }
        }
        sample()
      }),
  )
  expect(highest).toBe(0)
})

test('the default text is Inter at 16 pixels', async ({ page }) => {
  const style = await page.evaluate(() => {
    const { fontFamily, fontSize } = getComputedStyle(document.documentElement)
    return { fontFamily, fontSize }
  })
  expect(style.fontFamily).toMatch(/^"Inter Variable"/)
  expect(style.fontSize).toBe('16px')
})

test.describe('panel and content components', () => {
  for (const theme of themes) {
    const scope = (page: Page) => page.getByTestId(`components-${theme}`)
    const box = (page: Page, testId: string) => scope(page).getByTestId(testId)

    test(`${theme}: in the narrow panel the title is cut, the footer wraps, and no child is wider than the panel`, async ({
      page,
    }) => {
      const narrow = box(page, 'panel-narrow')
      const title = narrow.locator('h2')
      expect(
        await title.evaluate((e) => ({
          overflow: getComputedStyle(e).textOverflow,
          clipped: e.scrollWidth > e.clientWidth,
        })),
      ).toEqual({ overflow: 'ellipsis', clipped: true })
      const lines = await narrow
        .locator('[data-slot="footer"] button')
        .evaluateAll((buttons) => new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size)
      expect(lines).toBe(2)
      const wider = await narrow.evaluate((e) => {
        const panel = e.firstElementChild as HTMLElement
        const limit = panel.getBoundingClientRect().right + 0.5
        return Array.from(panel.querySelectorAll('*')).filter((child) => child.getBoundingClientRect().right > limit)
          .length
      })
      expect(wider).toBe(0)
    })

    test(`${theme}: the long word of the narrow callout breaks inside its box`, async ({ page }) => {
      const narrow = box(page, 'callout-narrow')
      const sizes = await narrow.evaluate((e) => {
        const callout = e.firstElementChild as HTMLElement
        return {
          box: e.getBoundingClientRect().width,
          callout: callout.getBoundingClientRect().width,
          overflows: callout.scrollWidth > callout.clientWidth,
        }
      })
      expect(sizes.callout).toBeLessThanOrEqual(sizes.box)
      expect(sizes.overflows).toBe(false)
    })

    test(`${theme}: the dividers have their sizes`, async ({ page }) => {
      const size = async (testId: string) => {
        const b = await box(page, testId).locator('hr').boundingBox()
        return { width: b?.width, height: b?.height }
      }
      const holder = await box(page, 'divider-plain').boundingBox()
      expect(await size('divider-plain')).toEqual({ width: holder?.width, height: 1 })
      expect(await size('divider-accent')).toEqual({ width: 56, height: 2 })
    })

    test(`${theme}: a badge is one line high`, async ({ page }) => {
      const badge = box(page, 'badges').locator('span').first()
      const { height, line } = await badge.evaluate((e) => ({
        height: e.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(e).lineHeight),
      }))
      expect(height).toBeLessThan(line + 8)
    })
  }
})
