import { RANK_NAME } from './ranges.js'

/**
 * Render the managed changeset. With no affected packages this is a valid **empty** changeset
 * (accounts for the change with no version bump); otherwise frontmatter lists each package's bump,
 * sorted for stable, diff-friendly output. The summary is the PR title verbatim — the filename, not
 * the body, marks the file as automation-managed.
 */
export const renderChangeset = (affected: ReadonlyMap<string, number>, summary: string): string => {
  if (affected.size === 0) {
    return `---\n---\n\n${summary}\n`
  }
  const frontmatter = [...affected.keys()]
    .sort()
    .map((name) => `'${name}': ${RANK_NAME[affected.get(name) as number]}`)
    .join('\n')
  return `---\n${frontmatter}\n---\n\n${summary}\n`
}
