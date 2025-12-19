import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import camelCase from 'lodash-es/camelCase.js'
import castArray from 'lodash-es/castArray.js'
import merge from 'lodash-es/merge.js'
import snakeCase from 'lodash-es/snakeCase.js'
import type { BookifyProject, BookifyProjectConfig } from './model.js'

const require = createRequire(import.meta.url)

/**
 * Resolves a CSS path that may be a file system path or an npm package path (npm://@scope/package/path/to/file.css)
 */
const resolveCssPath = (cssPath: string): string => {
  if (cssPath.startsWith('pkg://')) {
    // Strip the pkg:// prefix and resolve via require
    const npmPath = cssPath.slice(6) // Remove 'pkg://'
    try {
      return require.resolve(npmPath)
    } catch (error) {
      throw new Error(
        `Failed to resolve npm package path: ${cssPath}\n\n` +
          `Possible causes:\n` +
          `  - Package is not installed (run: npm install ${npmPath
            .split('/')
            .slice(0, npmPath.startsWith('@') ? 2 : 1)
            .join('/')})\n` +
          `  - Path is not exported in the package's package.json "exports" field\n` +
          `  - Package does not contain the specified file\n\n` +
          `Tip: Check the package's documentation for available export paths.`,
        {
          cause: error,
        },
      )
    }
  }
  // Regular file system path
  return path.resolve(cssPath)
}

const resolveAssetPaths = (paths: string | string[] = []) => castArray(paths).map((p) => path.resolve(p))
const resolveCssPaths = (paths: string[] = []): string[] => paths.map((p) => resolveCssPath(p))
const resolveInputPaths = (paths: string[] = []): string[] => paths.map((p) => path.resolve(p))

/**
 * Reads environment variables matching the renderer prefix and converts them to renderer options.
 * For example, if renderer is 'euro-pdf', it will look for environment variables like:
 *   - EURO_PDF_API_KEY -> { apiKey: value }
 *   - EURO_PDF_TEST_MODE -> { testMode: value }
 */
const getDefaultRendererOptions = (renderer: string): Record<string, string> => {
  const prefix = `${snakeCase(renderer).toUpperCase()}_`
  const options: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      const suffix = key.slice(prefix.length)
      const optionName = camelCase(suffix)
      options[optionName] = value
    }
  }

  return options
}

/**
 * Given a user-supplied project configuration, generates a fully resolved and validated project.
 */
export const resolveConfig = (config: BookifyProjectConfig): BookifyProject => {
  const renderer = config.pdf?.renderer ?? 'euro-pdf'

  return {
    assetPaths: resolveAssetPaths(config.assetPaths ?? process.cwd()),
    css: resolveCssPaths(config.css),
    inputs: resolveInputPaths(config.inputs),
    pdf: {
      renderer,
      rendererOptions: merge({}, getDefaultRendererOptions(renderer), config.pdf?.rendererOptions ?? {}),
    },
  }
}
