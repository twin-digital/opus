import type { SyncPlugin } from './sync-plugin.js'
import { makeSyncPlugin, transformJson } from './make-config-plugin.js'
import type { Configuration } from '../repo-kit-configuration.js'
import type { ProjectManifest } from '@pnpm/types'
import { canonicalizeJson } from '../utils/canonicalize-json.js'

/**
 * Config plugin that adds the scripts necessary to run eslint.
 */
export const makeEslintScriptsPlugin = ({
  eslint,
}: Configuration): SyncPlugin | undefined =>
  eslint ?
    makeSyncPlugin('eslint-scripts', {
      'package.json': transformJson((content) => {
        const manifest = content as ProjectManifest
        return {
          ...manifest,
          scripts: canonicalizeJson({
            ...manifest.scripts,
            lint: 'eslint --no-error-on-unmatched-pattern src',
            'lint:fix':
              'eslint --no-error-on-unmatched-pattern --fix src && prettier --write --ignore-path ../../../.gitignore .',
          }),
        }
      }),
    })
  : undefined
