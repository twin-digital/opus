import fs from 'fs'
import path from 'path'
import { type ConfigPlugin } from './config-plugin.js'
import pull from 'lodash-es/pull.js'
import { makeConfigPlugin, transformJson } from './make-config-plugin.js'
import type { ProjectManifest } from '@pnpm/types'

/**
 * Creates a `ConfigPlugin` which updates the exports in a package's package.json file to include all barrel files
 * in the source root, or one level deep.
 */
export const makePackageJsonFilesPlugin = (): ConfigPlugin =>
  makeConfigPlugin('package.json files', {
    'package.json': transformJson((content, { packagePath }) => {
      const manifest = content === undefined ? {} : (content as ProjectManifest)
      const files = manifest.files ?? []
      manifest.files = files

      const srcDir = path.join(packagePath, 'src')
      if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
        if (!files.includes('dist')) {
          files.push('dist')
        }
        if (!files.includes('!dist/**/*.d.ts.map')) {
          const index = files.indexOf('dist')
          files.splice(index + 1, 0, '!dist/**/*.d.ts.map')
        }
      } else {
        pull(files, 'dist', '!dist/**/*.d.ts.map')
      }

      return manifest
    }),
  })
