// The kit's increment-009 surface, declared here so this package compiles ahead of the sibling
// package's own prepare. Delete this file once @twin-digital/mc-dev-kit exports it.
import '@twin-digital/mc-dev-kit'

declare module '@twin-digital/mc-dev-kit' {
  /** The workspace root d-joa4eefg has the kit resolve, and the name of the package there. */
  export interface WorkspaceRoot {
    root: string
    packageName: string
  }

  /**
   * Climbs ancestors of `from` until one holds a `pnpm-workspace.yaml`/`.yml` or a `package.json`
   * declaring `workspaces`. No ancestor being a root returns `undefined`; a marker that cannot be
   * read throws.
   */
  export function findWorkspaceRoot(from?: string): Promise<WorkspaceRoot | undefined>
}
