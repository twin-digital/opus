// Renders the images that ../brand.md embeds from brand-basics.html, in light and dark.
// Needs Playwright with Chromium: node nodejs/wishem/docs/brand/render.mjs
// With a global install: NODE_PATH="$(npm root -g)" node nodejs/wishem/docs/brand/render.mjs
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Loaded with require so a global Playwright install is found through NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright')
const here = dirname(fileURLToPath(import.meta.url))
const page = pathToFileURL(join(here, 'brand-basics.html')).href
const shots = ['header', 'palette', 'editor', 'type', 'aside']

const browser = await chromium.launch()
try {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 920, height: 1200 },
      deviceScaleFactor: 2,
      colorScheme,
    })
    const tab = await context.newPage()
    await tab.goto(page, { waitUntil: 'networkidle' })
    await tab.evaluate(() => document.fonts.ready)
    for (const shot of shots) {
      await tab.locator(`#shot-${shot}`).screenshot({
        path: join(here, `${shot}-${colorScheme}.png`),
      })
    }
    await context.close()
  }
} finally {
  await browser.close()
}
