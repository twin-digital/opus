// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const workflowPath = new URL('../../../../.github/workflows/ci.yaml', import.meta.url)

describe('Playwright image tag', () => {
  it('is the installed version of @playwright/test', () => {
    const installed = (require('@playwright/test/package.json') as { version: string }).version
    const tag = /image:\s*mcr\.microsoft\.com\/playwright:v([^-\s]+)-noble/.exec(
      readFileSync(workflowPath, 'utf8'),
    )?.[1]

    expect(tag, `ci.yaml has Playwright image version ${tag ?? '(none)'}, but @playwright/test is ${installed}`).toBe(
      installed,
    )
  })
})
