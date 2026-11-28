import { defineConfig, devices } from '@playwright/test'

const wsEndpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT
if (!wsEndpoint) {
  throw new Error('WISHEM_BROWSER_WS_ENDPOINT is not set. Run the tests with the "test:ui" script.')
}

// The pages of the workbench. `scripts/e2e-server.ts` serves them on the computer of the test runner.
const WORKBENCH_URL = 'http://127.0.0.1:4180'
// The workbench with the sample product mounted (`--product`).
const PRODUCT_URL = 'http://127.0.0.1:4184'

const server = (command: string, url: string) => ({
  command,
  url,
  reuseExistingServer: false,
  gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10_000 },
})

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
  // The workbenches run on the computer of the test runner, from the real start script.
  webServer: [
    server('node scripts/e2e-server.ts', WORKBENCH_URL),
    server('node scripts/e2e-server.ts --product', PRODUCT_URL),
  ],
  expect: {
    // The default of Playwright, stated because the design requires it.
    toHaveScreenshot: { animations: 'disabled' },
  },
  // Chromium only, with a viewport of 1280 by 720 pixels.
  projects: [
    {
      name: 'style-guide',
      testMatch: 'style-guide.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // The static server runs in the browser container, on the port that browser-server.ts sets.
        baseURL: 'http://127.0.0.1:4173',
        // The browser runs in the container. No local browser starts.
        connectOptions: { wsEndpoint },
      },
    },
    {
      name: 'workbench',
      testMatch: 'workbench.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WORKBENCH_URL,
        // The browser sends its requests to loopback addresses through this connection to the test runner.
        connectOptions: { wsEndpoint, exposeNetwork: '<loopback>' },
      },
    },
    {
      name: 'product',
      testMatch: 'product.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: PRODUCT_URL,
        connectOptions: { wsEndpoint, exposeNetwork: '<loopback>' },
      },
    },
  ],
})
