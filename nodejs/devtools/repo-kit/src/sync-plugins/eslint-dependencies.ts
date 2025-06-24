import type { SyncPlugin } from './sync-plugin.js'
import { makeSyncPlugin, transformJson } from './make-config-plugin.js'
import type { Configuration } from '../repo-kit-configuration.js'
import type { ProjectManifest } from '@pnpm/types'
import { canonicalizeJson } from '../utils/canonicalize-json.js'

/**
 * Config plugin that adds the dependencies necessary to use our project's eslint configuration.
 */
export const makeEslintDependenciesPlugin = ({
  eslint,
}: Configuration): SyncPlugin | undefined =>
  eslint ?
    makeSyncPlugin(
      'eslint-dependencies',
      {
        'package.json': transformJson((content) => {
          const manifest = content as ProjectManifest
          return {
            ...manifest,
            devDependencies: canonicalizeJson({
              ...manifest.devDependencies,
              '@eslint/js': 'catalog:',
              '@twin-digital/eslint-config': 'workspace:*',
              eslint: 'catalog:',
              'eslint-config-prettier': 'catalog:',
              globals: 'catalog:',
              prettier: 'catalog:',
              'typescript-eslint': 'catalog:',
            }),
          }
        }),
      },
      {
        requiresDependencyInstall: true,
      },
    )
  : undefined
