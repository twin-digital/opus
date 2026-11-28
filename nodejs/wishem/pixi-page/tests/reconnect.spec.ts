import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test } from '@playwright/test'

const PORT = 4182
const PAGE_URL = `http://127.0.0.1:${String(PORT)}/`

interface Command {
  child: ChildProcess
  exited: Promise<void>
  ready: Promise<void>
}

/** Runs the start command as a child process of the test. */
const startCommand = (): Command => {
  const child = spawn('node', ['scripts/start.ts', '--port', String(PORT), '--hub-port', '0'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const exited = new Promise<void>((resolve) => {
    child.on('exit', () => {
      resolve()
    })
  })
  const ready = new Promise<void>((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('PixiJS page at')) {
        resolve()
      }
    })
    child.on('exit', () => {
      reject(new Error('the command ended before it was ready'))
    })
  })
  return { child, exited, ready }
}

const stopCommand = async (command: Command) => {
  command.child.kill('SIGTERM')
  await command.exited
}

test('the page connects again after the command stops and starts, with no reload', async ({ page }) => {
  let command = startCommand()
  try {
    await command.ready
    await page.goto(PAGE_URL)
    await expect(page.getByRole('status')).toContainText('Connected (link 1)')
    // A reload of the page removes this value.
    await page.evaluate(() => {
      ;(window as unknown as { reloadMarker: boolean }).reloadMarker = true
    })

    await stopCommand(command)
    await expect(page.getByRole('status')).toContainText('The construct is not reachable')

    command = startCommand()
    await command.ready
    await expect(page.getByRole('status')).toContainText('Connected (link 2)', { timeout: 15_000 })
    // The Vite client polls each second and reloads the page when it sees the server.
    await page.waitForTimeout(4000)
    await expect(page.getByRole('status')).toContainText('Connected (link 2)')
    expect(await page.evaluate(() => (window as unknown as { reloadMarker?: boolean }).reloadMarker)).toBe(true)
  } finally {
    await stopCommand(command)
  }
})
