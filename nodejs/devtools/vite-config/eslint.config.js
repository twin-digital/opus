// Managed by repo-kit. The shared base config lives in
// @twin-digital/eslint-config; per-package overrides go in a sibling
// eslint.config.d/*.js (default-exported flat-config fragments,
// appended in filename order) — never in this file.
import { defineProjectConfig } from '@twin-digital/eslint-config'

export default await defineProjectConfig(import.meta.url)
