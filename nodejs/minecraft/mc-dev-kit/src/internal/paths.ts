import path from 'node:path'

/**
 * Expresses `target` relative to `root` as a normalised POSIX path with no `./` prefix and no
 * trailing slash. A target equal to the root is the single dot `.`.
 */
export function toWorkspaceRelative(root: string, target: string): string {
  const relative = path.relative(root, target)
  return relative === '' ? '.' : relative.split(path.sep).join('/')
}

/** Joins workspace-relative segments onto `dir`, keeping the root's `.` out of the result. */
export function joinRelative(dir: string, ...segments: string[]): string {
  const prefix = dir === '.' ? '' : `${dir}/`
  return `${prefix}${segments.join('/')}`
}

/**
 * Orders entries by package directory, the root package first and a package's behavior pack
 * before its resource pack. Returns a negative, zero, or positive number, as a sort comparator.
 */
export function compareEntryPaths(
  a: { packageDir: string; kind: string },
  b: { packageDir: string; kind: string },
): number {
  if (a.packageDir !== b.packageDir) {
    if (a.packageDir === '.') {
      return -1
    }
    if (b.packageDir === '.') {
      return 1
    }
    return a.packageDir < b.packageDir ? -1 : 1
  }
  if (a.kind === b.kind) {
    return 0
  }
  return a.kind === 'behavior' ? -1 : 1
}
