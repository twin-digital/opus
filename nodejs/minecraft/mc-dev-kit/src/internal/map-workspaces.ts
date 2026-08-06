// @npmcli/map-workspaces ships no type declarations. This module is the one place that untyped
// import lives, and the signature below is the whole of what the kit asks of it.
// @ts-expect-error the package ships no type declarations
import untyped from '@npmcli/map-workspaces'

export interface MapWorkspacesOptions {
  /** the workspace root */
  cwd: string
  /** the root package's parsed `package.json` */
  pkg: Record<string, unknown>
}

/** Maps each workspace member's package name to its absolute directory. Never returns the root. */
export const mapWorkspaces = untyped as (options: MapWorkspacesOptions) => Promise<Map<string, string>>
