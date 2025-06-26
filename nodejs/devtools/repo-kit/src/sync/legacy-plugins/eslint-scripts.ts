import type { LegacySyncPlugin } from '../legacy-sync-plugin.js'
import {
  makeConfigPlugin,
  transformJson,
} from '../legacy-make-config-plugin.js'
import type { Configuration } from '../../repo-kit-configuration.js'
import type { ProjectManifest } from '@pnpm/types'
import { canonicalizeJson } from '../../utils/canonicalize-json.js'

/**
 * Config plugin that adds the scripts necessary to run eslint.
 */
export const makeEslintScriptsPlugin = ({
  eslint,
}: Configuration): LegacySyncPlugin | undefined =>
  eslint ?
    makeConfigPlugin('eslint-scripts', {
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
