import { defineConfig, devices } from '@playwright/test'

const wsEndpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
if (!wsEndpoint) {
  throw new Error('WISHEM_BROWSER_WS_ENDPOINT is not set. Run the tests with the "test:ui" script.')
}

// The page of the construct. `scripts/start.ts` serves it on the computer of the test runner.
const PAGE_URL = 'http://127.0.0.1:4181/'

export default defineConfig({
  // The Vitest unit tests are in src/.
  testDir: './tests',
  // One baseline for each name: the pinned image is the only browser and platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // One worker and no retry: the construct is shared, and a retry would start from a later tick.
  workers: 1,
  retries: 0,
  // A test.only that stays in a file fails the job.
  forbidOnly: !!process.env.CI,
  // The job uploads the HTML report when a test fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // The construct and the page server run in one process, paused at tick 0.
  webServer: {
    command: 'node scripts/start.ts --port 4181 --hub-port 0 --paused',
    url: PAGE_URL,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
  expect: {
    // The default of Playwright, stated because the design requires it.
    toHaveScreenshot: { animations: 'disabled' },
  },
  // Chromium only, with a viewport of 1280 by 720 pixels.
  projects: [
    {
      name: 'pixi-page',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        baseURL: PAGE_URL,
        // The browser sends its requests to loopback addresses through this connection to the test runner.
        connectOptions: { wsEndpoint, exposeNetwork: '<loopback>' },
      },
    },
  ],
})
