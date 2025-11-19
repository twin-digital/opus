import fsP from 'node:fs/promises'

/**
 * Given a glob pattern (or array of patterns) and a working directory (default: cwd), returns true if there is at least
 * one file matches any of the globs.
 *
 * @param pattern Glob or array of globs to match
 * @param cwd Working directory from which to match files, defaulting to cwd
 * @return true if the glob(s) match at least one file, otherwise false
 */
export async function globMatches(pattern: string | string[], cwd: string = process.cwd()): Promise<boolean> {
  const iterator = fsP.glob(pattern, {
    cwd,
  })

  const { done = false } = await iterator.next()
  return !done
}
