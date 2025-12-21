import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import camelCase from 'lodash-es/camelCase.js'
import castArray from 'lodash-es/castArray.js'
import merge from 'lodash-es/merge.js'
import snakeCase from 'lodash-es/snakeCase.js'
import { normalizePath } from './glob.js'
import type { BookifyProject, BookifyProjectConfig } from './model.js'

const require = createRequire(import.meta.url)

/**
 * Resolves a CSS path that may be a file system path or a package path.
 * @param cssPath The path to resolve (may have pkg:// prefix)
 * @param basePath The base directory to resolve relative paths from
 */
const resolveCssPath = (cssPath: string, basePath: string): string => {
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

  // Regular file system path - resolve relative to basePath
  return path.resolve(basePath, cssPath)
}

const resolveAssetPaths = (paths: string | string[] = [], basePath: string) =>
  castArray(paths).map((p) => path.resolve(basePath, p))

const resolveCssPaths = (paths: string[] = [], basePath: string): string[] =>
  paths.map((p) => resolveCssPath(p, basePath)).map(normalizePath)

const resolveInputPaths = (paths: string[] = [], basePath: string): string[] =>
  paths.map((p) => path.resolve(basePath, p)).map(normalizePath)

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
 * @param config The project configuration to resolve
 * @param basePath The base directory to resolve relative paths from (defaults to cwd)
 */
export const resolveConfig = (config: BookifyProjectConfig, basePath: string = process.cwd()): BookifyProject => {
  const renderer = config.pdf?.renderer ?? 'euro-pdf'

  return {
    assetPaths: resolveAssetPaths(config.assetPaths ?? basePath, basePath),
    css: resolveCssPaths(config.css ?? [], basePath),
    inputs: resolveInputPaths(config.inputs, basePath),
    pdf: {
      renderer,
      rendererOptions: merge({}, getDefaultRendererOptions(renderer), config.pdf?.rendererOptions ?? {}),
    },
  }
}
