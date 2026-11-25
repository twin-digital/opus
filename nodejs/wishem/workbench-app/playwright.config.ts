import { defineConfig, devices } from '@playwright/test'

const wsEndpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
if (!wsEndpoint) {
  throw new Error('WISHEM_BROWSER_WS_ENDPOINT is not set. Run the tests with the "test:ui" script.')
}

export default defineConfig({
  // The Vitest unit tests are in src/.
  testDir: './tests',
  // One baseline for each name: the pinned image is the only browser and platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // One worker: parallel pages in the shared browser make screenshots of tall sections unstable.
  workers: 1,
  // A test.only that stays in a file fails the job.
  forbidOnly: !!process.env.CI,
  // The job uploads the HTML report when a test fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // The static server runs in the browser container, on the port that browser-server.ts sets.
    baseURL: 'http://127.0.0.1:4173',
    // The browser runs in the container. No local browser starts.
    connectOptions: { wsEndpoint },
  },
  expect: {
    // The default of Playwright, stated because the design requires it.
    toHaveScreenshot: { animations: 'disabled' },
  },
  // Chromium only, with a viewport of 1280 by 720 pixels.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
