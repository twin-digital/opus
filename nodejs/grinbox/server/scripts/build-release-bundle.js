#!/usr/bin/env node
// Builds the daemon's release artifact (d-6ct1o00j) and writes it to
// .release-assets/, where the publish workflow's release-assets hook uploads it
// to this package's GitHub release.
//
// Where it unpacks is fixed (d-p77q4tob), and the deployment reads that layout
// from another repository, so neither side may move a path without the other:
//
//   grinbox-server-<version>.tar.gz
//     package.json      production manifest, pruned to the daemon's dependencies
//     pnpm-lock.yaml    pruned lockfile, so the on-target install is reproducible
//     pnpm-workspace.yaml  carries the build allowance the native state store needs
//     server/           the daemon's compiled output; entry point server/main.js
//     bin/              the launch wrapper
//     systemd/          the unit
//
// The browser application is @grinbox/web's own artifact, unpacking to `web/`
// beside this one. The two always carry the same version (d-vx1pxkyz).
//
// node_modules is deliberately absent: better-sqlite3 is native and must be
// built against the Node ABI it will run on, so the deployment installs on the
// target from the manifest above.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageRoot, '../../..')

/** @typedef {{ name: string, version: string, type?: string, engines?: Record<string, string>, scripts?: unknown, devDependencies?: unknown, dependencies?: Record<string, string> }} Manifest */

/** @type {Manifest} */
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const { version } = manifest

const outDir = join(packageRoot, '.release-assets')
const stage = join(outDir, `grinbox-server-${version}`)

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} cwd
 */
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' })
// Through turbo, so this package's own dependencies are built first and the
// build config resolves a sibling's declarations rather than its source.
run('pnpm', ['build', '--filter=@grinbox/server'], workspaceRoot)

cpSync(join(packageRoot, 'dist'), join(stage, 'server'), { recursive: true })
cpSync(join(packageRoot, 'deploy/run-grinbox.sh'), join(stage, 'bin/run-grinbox.sh'), { recursive: true })
cpSync(join(packageRoot, 'deploy/grinbox.service'), join(stage, 'systemd/grinbox.service'), { recursive: true })

// `catalog:` is a workspace protocol and means nothing to an install outside the
// workspace, so catalogued specifiers are resolved against it here.
/** @type {{ catalog?: Record<string, string> }} */
const workspaceConfig = parse(readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8'))
const catalog = workspaceConfig.catalog ?? {}
/**
 * @param {string} name
 * @param {string} specifier
 * @returns {string}
 */
const resolveSpecifier = (name, specifier) => {
  if (!specifier.startsWith('catalog:')) {
    return specifier
  }
  const entry = specifier.slice('catalog:'.length).trim()
  if (entry !== '' && entry !== 'default') {
    throw new Error(`${name}: named catalogs are not resolved by this bundle (${specifier})`)
  }
  const resolved = catalog[name]
  if (resolved === undefined) {
    throw new Error(`${name}: no catalog entry to resolve ${specifier}`)
  }
  return resolved
}

// Workspace siblings are compiled with tsc rather than inlined, so the daemon's
// output still imports them by name. They are vendored into the bundle and
// depended on by path, which keeps them out of the registry (d-cjjd5c0w) and
// leaves the target's install resolving only third-party packages.
/**
 * @param {string} name
 * @returns {string}
 */
const vendorWorkspaceDependency = (name) => {
  const source = resolve(workspaceRoot, 'nodejs/grinbox', name.slice('@grinbox/'.length))
  const target = join(stage, 'vendor', name.slice('@grinbox/'.length))
  /** @type {Manifest} */
  const siblingManifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))

  cpSync(join(source, 'dist'), join(target, 'dist'), { recursive: true })
  writeFileSync(
    join(target, 'package.json'),
    `${JSON.stringify(
      {
        ...siblingManifest,
        scripts: undefined,
        devDependencies: undefined,
        dependencies: Object.fromEntries(
          Object.entries(siblingManifest.dependencies ?? {}).map(([dep, spec]) => [dep, resolveSpecifier(dep, spec)]),
        ),
      },
      null,
      2,
    )}\n`,
  )
  return `file:./vendor/${name.slice('@grinbox/'.length)}`
}

// The daemon runs from the bundle rather than the workspace: its own
// dependencies are what the target installs, and `type` and `engines` carry over
// because the target reads them.
const { dependencies = {} } = manifest
const runtimeDependencies = Object.fromEntries(
  Object.entries(dependencies).map(([name, specifier]) =>
    specifier.startsWith('workspace:') ?
      [name, vendorWorkspaceDependency(name)]
    : [name, resolveSpecifier(name, specifier)],
  ),
)
writeFileSync(
  join(stage, 'package.json'),
  `${JSON.stringify(
    {
      name: 'grinbox',
      version,
      private: true,
      type: manifest.type,
      engines: manifest.engines,
      dependencies: runtimeDependencies,
    },
    null,
    2,
  )}\n`,
)

// pnpm 11 fails an install outright on an unlisted build script, and the state
// store has one. The workspace's own allowance does not travel with the bundle.
writeFileSync(join(stage, 'pnpm-workspace.yaml'), 'allowBuilds:\n  better-sqlite3: true\n')

// A lockfile resolved from the manifest above, so the on-target install is
// `--frozen-lockfile` reproducible rather than whatever the registry offers that
// day.
run('pnpm', ['install', '--lockfile-only', '--ignore-workspace'], stage)

run('tar', ['-czf', `grinbox-server-${version}.tar.gz`, '-C', outDir, `grinbox-server-${version}`], outDir)
rmSync(stage, { recursive: true, force: true })

console.log(`✅ .release-assets/grinbox-server-${version}.tar.gz`)
