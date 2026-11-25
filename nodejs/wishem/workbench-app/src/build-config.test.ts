// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const packageDir = join(import.meta.dirname, '..')
const scripts = (
  JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
).scripts

describe('the workbench build', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'workbench-build-'))
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it('has the workbench page and not the style guide', () => {
    execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: packageDir,
      stdio: 'pipe',
    })
    const files = readdirSync(outDir, { recursive: true, encoding: 'utf8' })
    expect(files).toContain('index.html')
    expect(files).not.toContain('style-guide.html')
    const code = files
      .filter((file) => /\.(js|css)$/.test(file))
      .map((file) => readFileSync(join(outDir, file), 'utf8'))
      .join('\n')
    expect(code).toContain('Nothing to show yet.')
    expect(code).not.toContain('style guide')
  }, 120_000)
})

describe('the package scripts', () => {
  it('starts the style guide page', () => {
    expect(scripts['style-guide']).toContain('/style-guide.html')
  })

  it('runs the browser tests in the pinned browser', () => {
    expect(scripts['test:ui']).toMatch(/^node scripts\/browser-server\.ts playwright test/)
  })
})
