import type { SyncPlugin } from './sync-plugin.js'
import { makeSyncPlugin } from './make-config-plugin.js'
import type { Configuration } from '../repo-kit-configuration.js'

const bootstrapEslintConfig = `import base from '@twin-digital/eslint-config'

export default base
`

/**
 * Config plugin that returns default eslint configuration content if there is no pre-existing configuration, otherwise
 * it returns the original content unchanged. This plugin can be used to ensure that new projects are properly
 * initialized without overwriting any package-specific configuration.
 */
export const makeEslintBootstrapPlugin = ({
  eslint,
}: Configuration): SyncPlugin | undefined =>
  eslint ?
    makeSyncPlugin('eslint-config-bootstrap', {
      'eslint.config.js': (content) => {
        return content ?? bootstrapEslintConfig
      },
    })
  : undefined
