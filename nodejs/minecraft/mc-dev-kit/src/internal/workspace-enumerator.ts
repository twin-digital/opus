import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mapWorkspaces from '@npmcli/map-workspaces'
import { findWorkspacePackages } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import type { CandidatePackage } from './candidate.js'
import { parseJson } from './json.js'
import { toWorkspaceRelative } from './paths.js'

/**
 * Enumerates the workspace's candidate packages, each with its `package.json` already parsed.
 *
 * A root `pnpm-workspace.yaml` selects pnpm, and anything else is read as an npm workspace. Each
 * manager's own published enumeration library does the enumerating, called in-process: pnpm's
 * `findWorkspacePackages` returns the root package among the members, and npm's `mapWorkspaces`
 * returns the members only, so the root is added as a candidate of its own. Candidates are
 * deduplicated by workspace-relative path.
 *
 * Nothing here needs `node_modules`, a lockfile, a build, or a running server.
 *
 * @param workspaceRoot - the absolute path of the workspace root
 * @returns the candidate packages, in the order the library returned them, root first under npm
 * @throws whatever the enumeration failed with, unwrapped — the workspace root holds neither a
 *   readable `pnpm-workspace.yaml` nor a readable `package.json`, the root `package.json` is not
 *   valid JSON, or the enumeration library threw, which it does when any member's `package.json`
 *   is not valid JSON
 */
export async function enumerateCandidates(workspaceRoot: string): Promise<CandidatePackage[]> {
  const workspaceManifest = await readWorkspaceManifest(workspaceRoot)
  const candidates =
    workspaceManifest ?
      await pnpmCandidates(workspaceRoot, workspaceManifest.packages)
    : await npmCandidates(workspaceRoot)

  const byPackageDir = new Map<string, CandidatePackage>()
  for (const candidate of candidates) {
    if (!byPackageDir.has(candidate.packageDir)) {
      byPackageDir.set(candidate.packageDir, candidate)
    }
  }
  return [...byPackageDir.values()]
}

/** The `packages` patterns reach the library unread; an absent field leaves it on its defaults. */
async function pnpmCandidates(workspaceRoot: string, patterns: string[] | undefined): Promise<CandidatePackage[]> {
  const projects = await findWorkspacePackages(workspaceRoot, { patterns })
  return projects.map((project) => ({
    packageDir: toWorkspaceRelative(workspaceRoot, project.rootDir),
    absoluteDir: project.rootDir,
    packageJson: project.manifest as unknown as Record<string, unknown>,
  }))
}

/** `mapWorkspaces` never returns the root package, so the kit adds it as a candidate of its own. */
async function npmCandidates(workspaceRoot: string): Promise<CandidatePackage[]> {
  const rootPackageJson = await readPackageJson(workspaceRoot)
  const members = await mapWorkspaces({ cwd: workspaceRoot, pkg: rootPackageJson })

  const candidates: CandidatePackage[] = [{ packageDir: '.', absoluteDir: workspaceRoot, packageJson: rootPackageJson }]
  for (const memberDir of members.values()) {
    candidates.push({
      packageDir: toWorkspaceRelative(workspaceRoot, memberDir),
      absoluteDir: memberDir,
      packageJson: await readPackageJson(memberDir),
    })
  }
  return candidates
}

async function readPackageJson(dir: string): Promise<Record<string, unknown>> {
  const contents = await readFile(path.join(dir, 'package.json'), 'utf8')
  return parseJson(contents) as Record<string, unknown>
}
