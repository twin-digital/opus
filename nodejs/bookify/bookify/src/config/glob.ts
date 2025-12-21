import { glob } from 'node:fs/promises'
import path from 'node:path'

/**
 * Checks if a path contains glob patterns
 */
export const isGlob = (pattern: string): boolean => {
  return /[*?[\]{}]/.test(pattern)
}

/**
 * Resolves glob patterns to actual file paths.
 * Non-glob paths are returned as-is in an array.
 * @param patterns Array of absolute paths or glob patterns
 * @returns Array of absolute file paths
 */
export const resolveGlobs = async (patterns: string[]): Promise<string[]> => {
  const resolved: string[] = []

  for (const pattern of patterns) {
    if (isGlob(pattern)) {
      // Pattern is a glob - resolve it
      // If the pattern is absolute, use it directly; otherwise resolve from cwd
      const isAbsolute = path.isAbsolute(pattern)
      const files: string[] = []

      if (isAbsolute) {
        // For absolute glob patterns, we need to use the root as cwd
        // and make the pattern relative to the matched portion
        for await (const file of glob(pattern)) {
          files.push(path.resolve(file))
        }
      } else {
        for await (const file of glob(pattern)) {
          files.push(path.resolve(file))
        }
      }

      resolved.push(...files)
    } else {
      // Not a glob - add as-is
      resolved.push(pattern)
    }
  }

  return resolved
}

/**
 * Normalizes a path to use forward slashes (for glob compatibility on Windows)
 */
export const normalizePath = (filePath: string): string => {
  return filePath.split(path.sep).join('/')
}
