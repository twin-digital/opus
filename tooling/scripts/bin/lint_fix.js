#!/usr/bin/env node

import { $ } from '../lib/shell.js'

const gitIgnorePath = '../../../.gitignore'

$`eslint --no-error-on-unmatched-pattern --fix src`
$`prettier --write --ignore-path ${gitIgnorePath} .`
$`prettier-package-json --write ./package.json`
