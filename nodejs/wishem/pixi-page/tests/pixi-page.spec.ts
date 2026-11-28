import { expect, test } from '@playwright/test'

test('the page draws the ticks of the construct and sends the keys through the link', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas[data-ready]')
  await expect(canvas).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Connected (link 1)')

  // The construct starts paused at tick 0.
  await expect(canvas).toHaveScreenshot('tick-0.png')
  const tick0 = await canvas.screenshot()

  // The period key goes through the link to the hub, and the color comes back.
  await page.keyboard.press('.')
  await expect(canvas).toHaveScreenshot('tick-1.png')
  const tick1 = await canvas.screenshot()
  expect(Buffer.compare(tick0, tick1)).not.toBe(0)

  // Three intervals of the clock pass. The time is paused, so the picture stays.
  await page.waitForTimeout(1500)
  await expect(canvas).toHaveScreenshot('tick-1.png')

  // The space key runs the time again, and the picture changes.
  await page.keyboard.press('Space')
  await expect.poll(async () => Buffer.compare(tick1, await canvas.screenshot()), { timeout: 5000 }).not.toBe(0)
})
