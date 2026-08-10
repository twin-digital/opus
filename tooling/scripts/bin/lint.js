#!/usr/bin/env node

import path from 'node:path'
import { $ } from '../lib/shell.js'
import { getMonorepoRoot } from '../lib/get-monorepo-root.js'

const monorepoRoot = await getMonorepoRoot()

const gitIgnorePath = path.join(monorepoRoot, '.gitignore')
const prettierIgnorePath = path.join(monorepoRoot, '.prettierignore')

// The type-aware presets resolve every expression in a package, and a large one
// exhausts node's default heap before it finishes. Raise the ceiling rather than
// splitting the run: it is a limit, not a reservation, so small packages are
// unaffected. Set on the environment so it survives the shell hop in `$`.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' ')

$`eslint --no-error-on-unmatched-pattern --ignore-pattern node_modules/ .`
$`prettier --check --ignore-path ${gitIgnorePath} --ignore-path ${prettierIgnorePath} .`
$`prettier-package-json --list-different ./package.json`
