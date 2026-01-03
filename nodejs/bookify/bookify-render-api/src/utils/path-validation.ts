import { isAbsolute, normalize } from 'node:path'

/**
 * Checks if a path is relative and doesn't escape parent directories.
 * Uses path.normalize() to resolve all '.' and '..' components, then verifies
 * the normalized path doesn't try to escape upward or become absolute.
 *
 * @param p - The path to validate
 * @returns true if the path is safe (relative and contained), false otherwise
 *
 * @example
 * ```ts
 * isRelativePath('foo/bar.md')        // true
 * isRelativePath('./foo/bar.md')      // true
 * isRelativePath('../foo/bar.md')     // false - escapes parent
 * isRelativePath('foo/../../bar.md')  // false - escapes parent
 * isRelativePath('/etc/passwd')       // false - absolute
 * isRelativePath('C:/Windows')        // false - absolute (Windows)
 * ```
 */
export function isRelativePath(p: string): boolean {
  // Reject empty paths
  if (!p || p.length === 0) {
    return false
  }

  // Reject absolute paths
  if (isAbsolute(p)) {
    return false
  }

  // Normalize resolves . and .. components
  // e.g., 'child/../../sibling' becomes '../sibling'
  const normalized = normalize(p)

  // After normalization, if it starts with '..' it tries to escape parent
  return !normalized.startsWith('..') && !isAbsolute(normalized)
}
