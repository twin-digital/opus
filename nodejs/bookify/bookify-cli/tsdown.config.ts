// Managed by repo-kit. The bundle config is the shared base from
// @twin-digital/tsdown-config, plus any per-package overrides in a
// sibling tsdown.config.d/*.ts (default-exported partial configs,
// shallow-merged over the base). See @twin-digital/tsdown-config to
// add an override.
import { defineBundleConfig } from '@twin-digital/tsdown-config'

export default await defineBundleConfig(import.meta.url)
