import { defineConfig, devices } from '@playwright/test'

const wsEndpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
if (!wsEndpoint) {
  throw new Error('WISHEM_BROWSER_WS_ENDPOINT is not set. Run the tests with the "test:ui" script.')
}

// The static server runs in the browser container, so the page is on 127.0.0.1 for the browser.
export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    connectOptions: { wsEndpoint },
  },
  expect: {
    toHaveScreenshot: { animations: 'disabled' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
