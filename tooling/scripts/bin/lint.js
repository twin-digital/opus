#!/usr/bin/env node

import { $ } from '../lib/util/shell.js'

const gitIgnorePath = '../../../.gitignore'

$`eslint --no-error-on-unmatched-pattern src`
$`prettier --check --ignore-path ${gitIgnorePath} .`
$`prettier-package-json --list-different ./package.json`
