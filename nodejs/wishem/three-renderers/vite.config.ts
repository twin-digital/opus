// Managed by repo-kit. The shared base config lives in
// @twin-digital/vite-config; per-package overrides go in a sibling
// vite.config.d/*.js (default-exported partial configs, deep-merged
// in filename order) — never in this file.
import { defineConfig } from 'vite'

import { defineAppConfig } from '@twin-digital/vite-config'

export default defineConfig(await defineAppConfig(import.meta.url))
