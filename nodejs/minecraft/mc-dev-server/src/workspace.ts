import { resolveWorkspaceRoot } from '@twin-digital/mc-dev-kit'

/** The workspace a run addresses, and the compose project name derived from it. */
export interface Workspace {
  /** absolute path of the workspace root */
  root: string
  /** the root package's name, or its directory basename when it declares none */
  packageName: string
  /** the compose project name — one workspace, one server */
  project: string
}

/** No ancestor of the starting directory is a workspace root. */
export class NoWorkspaceError extends Error {
  constructor(from: string) {
    super(`no workspace root above ${from}: expected a pnpm-workspace.yaml or a package.json declaring workspaces`)
    this.name = 'NoWorkspaceError'
  }
}

/**
 * Sluggifies a package name into a compose project name: lowercase, anything outside
 * `[a-z0-9_-]` becomes a hyphen, runs collapse, and separators are trimmed off both ends. A name
 * with nothing left falls back to `mc-workspace`, since compose requires a leading alphanumeric.
 */
export const projectNameFor = (packageName: string): string => {
  const slug = packageName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return /^[a-z0-9]/.test(slug) ? slug : 'mc-workspace'
}

/**
 * Resolves the workspace a run addresses, through the kit's own root resolution — so a run started
 * from a subdirectory addresses the same server as one started from the root.
 */
export const resolveWorkspace = async (from: string): Promise<Workspace> => {
  const found = await resolveWorkspaceRoot({ from })
  if (found === undefined) {
    throw new NoWorkspaceError(from)
  }
  return { root: found.root, packageName: found.packageName, project: projectNameFor(found.packageName) }
}
