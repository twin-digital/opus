import path from 'node:path'
import { findWorkspaceRoot } from './internal/workspace-root-finder.js'
import type { WorkspaceRoot, WorkspaceRootOptions } from './types.js'

/**
 * Climbs from a starting directory until an ancestor is a workspace root, and reports that root
 * and the name of the package sitting at it.
 *
 * A directory is a workspace root when it holds a `pnpm-workspace.yaml` or `pnpm-workspace.yml`,
 * or a `package.json` declaring `workspaces`. That is the whole rule, and it is not the rule
 * {@link discoverPacks} applies to a root it is handed: that one takes any readable `package.json`
 * as a root, which is right for a root already chosen and would end an ascent at its first step.
 * The starting directory is itself a candidate, so a call made at the root returns it.
 *
 * The name comes from the root package's `package.json` `name`, and a root package declaring none
 * — or holding no `package.json` at all, which a pnpm root may — is named by its directory
 * basename.
 *
 * @param options - `from` is where the ascent starts, defaulting to `process.cwd()`, and a
 *   relative path resolves against that same directory
 * @returns the root found, or `undefined` where no ancestor is a workspace root — which is an
 *   answer the caller rules on rather than a fault
 * @throws when a marker cannot be read or parsed: an unreadable or malformed `pnpm-workspace.yaml`
 *   or `package.json` on the ascent fails the call naming the file, rather than being read as
 *   "not a root" and climbed past
 *
 * @example
 * ```ts
 * const found = await resolveWorkspaceRoot({ from: packageDir })
 * if (found === undefined) {
 *   throw new Error(`no workspace root above ${packageDir}`)
 * }
 * const packs = await discoverPacks({ workspace: found.root })
 * ```
 */
export async function resolveWorkspaceRoot(options: WorkspaceRootOptions = {}): Promise<WorkspaceRoot | undefined> {
  const from = path.resolve(process.cwd(), options.from ?? '.')
  return findWorkspaceRoot(from)
}
