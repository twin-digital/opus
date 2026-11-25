// Renders the images that ../brand.md embeds from brand-basics.html, in light and dark.
// Run, from the root of the repository: cd nodejs/wishem/workbench-app && node scripts/browser-server.ts node ../docs/brand/render.ts
// Without WISHEM_BROWSER_WS_ENDPOINT, it launches a local Chromium.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Playwright comes from the workbench-app package, which pins the version.
const { chromium } = createRequire(join(here, '../../workbench-app/package.json'))(
  '@playwright/test',
) as typeof import('@playwright/test')
const html = readFileSync(join(here, 'brand-basics.html'), 'utf8')
const shots = ['header', 'palette', 'editor', 'type', 'aside']
const endpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT

const browser = endpoint ? await chromium.connect(endpoint) : await chromium.launch()
try {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      viewport: { width: 920, height: 1200 },
      deviceScaleFactor: 2,
      colorScheme,
    })
    const tab = await context.newPage()
    // The browser can run on another computer, so the page gets the HTML as text.
    await tab.setContent(html, { waitUntil: 'networkidle' })
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
