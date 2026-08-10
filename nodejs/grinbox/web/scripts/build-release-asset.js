#!/usr/bin/env node
// Builds the browser application's release artifact (d-6ct1o00j) and writes it
// to .release-assets/, where the publish workflow's release-assets hook uploads
// it to this package's GitHub release.
//
// Where it unpacks is fixed (d-p77q4tob): the archive holds a single `web/`
// directory that sits beside the daemon's `server/`, which is where the daemon
// resolves the interface from unless the deployment says otherwise.
//
//   grinbox-web-<version>.tar.gz
//     web/            index.html and the content-hashed assets it names
//
// Self-contained: the fonts are bundled, so nothing here fetches at page load
// (r-ovi02v1m, r-zpdecb2z). It carries no server code — the @grinbox/server
// import is type-only and erased at build.
//
// This artifact and the daemon's always carry the same version (d-vx1pxkyz), so
// a deployment names one version and never pairs them by hand.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageRoot, '../../..')

/** @type {{ version: string }} */
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const { version } = manifest

const outDir = join(packageRoot, '.release-assets')
const stage = join(outDir, `grinbox-web-${version}`)

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} cwd
 */
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' })

// Through turbo, so this package's own dependencies are built first.
run('pnpm', ['build', '--filter=@grinbox/web'], workspaceRoot)

cpSync(join(packageRoot, 'dist'), join(stage, 'web'), { recursive: true })

run('tar', ['-czf', `grinbox-web-${version}.tar.gz`, '-C', outDir, `grinbox-web-${version}`], outDir)
rmSync(stage, { recursive: true, force: true })

console.log(`✅ .release-assets/grinbox-web-${version}.tar.gz`)
