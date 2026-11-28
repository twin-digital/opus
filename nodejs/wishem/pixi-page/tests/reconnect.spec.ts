import { expect, test } from '@playwright/test'
import type { ProductConstruct } from '@thrashplay/wishem-construct-manager/node'
import { startSampleConstruct } from './sample-construct.js'

const HUB_PORT = 4183

let construct: ProductConstruct | undefined

test.afterEach(async () => {
  await construct?.close()
  construct = undefined
})

test('the page connects again after the construct stops and starts, with no reload', async ({ page }) => {
  construct = await startSampleConstruct({ port: HUB_PORT, paused: true })
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Connected (link 1)')
  // A reload of the page removes this value.
  await page.evaluate(() => {
    ;(window as unknown as { reloadMarker: boolean }).reloadMarker = true
  })

  await construct.close()
  await expect(page.getByRole('status')).toContainText('The construct is not reachable')

  construct = await startSampleConstruct({ port: HUB_PORT, paused: true })
  await expect(page.getByRole('status')).toContainText('Connected (link 2)', { timeout: 15_000 })
  // The Vite client polls each second and reloads the page when it sees the server.
  await page.waitForTimeout(4000)
  await expect(page.getByRole('status')).toContainText('Connected (link 2)')
  expect(await page.evaluate(() => (window as unknown as { reloadMarker?: boolean }).reloadMarker)).toBe(true)
})
