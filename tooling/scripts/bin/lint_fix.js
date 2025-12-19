#!/usr/bin/env node

import path from 'node:path'
import { $ } from '../lib/shell.js'
import { getMonorepoRoot } from '../lib/get-monorepo-root.js'

const monorepoRoot = await getMonorepoRoot()

const gitIgnorePath = path.join(monorepoRoot, '.gitignore')
const prettierIgnorePath = path.join(monorepoRoot, '.prettierignore')

$`eslint --no-error-on-unmatched-pattern --fix src`
$`prettier --write --ignore-path ${gitIgnorePath} --ignore-path ${prettierIgnorePath} .`
$`prettier-package-json --write ./package.json`
