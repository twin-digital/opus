import { defineConfig, devices } from '@playwright/test'

const port = 4173
const wsEndpoint = process.env.WISHEM_BROWSER_WS_ENDPOINT

// With a browser server address, the static server runs next to that browser.
// Otherwise the browser runs here and this config starts the static server.
export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...(wsEndpoint ? { connectOptions: { wsEndpoint } } : {}),
  },
  expect: {
    toHaveScreenshot: { animations: 'disabled' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    wsEndpoint ? undefined : (
      {
        command: `node scripts/static-server.js dist-style-guide ${port}`,
        url: `http://127.0.0.1:${port}/style-guide.html`,
        reuseExistingServer: false,
      }
    ),
})
