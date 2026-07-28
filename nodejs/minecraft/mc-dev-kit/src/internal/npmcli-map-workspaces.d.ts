// @npmcli/map-workspaces ships no types; this declares the one call the kit makes.
declare module '@npmcli/map-workspaces' {
  interface MapWorkspacesOptions {
    cwd: string
    pkg: Record<string, unknown>
  }

  /** Maps each workspace member's package name to its absolute directory. */
  export default function mapWorkspaces(opts: MapWorkspacesOptions): Promise<Map<string, string>>
}
