import { existsSync, readdirSync } from 'node:fs'

import base from '@twin-digital/eslint-config'

// Project overrides: any 'eslint.config.d/*.js' config fragments (composed in filename
// order) extend the shared base. repo-kit features and packages drop fragments there
// instead of editing this file.
const overridesDir = new URL('./eslint.config.d/', import.meta.url)

const overrides = []
if (existsSync(overridesDir)) {
  const files = readdirSync(overridesDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
  for (const file of files) {
    const fragment = await import(new URL(file, overridesDir).href)
    overrides.push(...[fragment.default].flat())
  }
}

export default [...base, ...overrides]
