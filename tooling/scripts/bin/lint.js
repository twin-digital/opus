#!/usr/bin/env node

import { $ } from '../lib/util/shell.js'

const gitIgnorePath = '../../../.gitignore'

$`eslint --no-error-on-unmatched-pattern --ignore-pattern node_modules/ .`
$`prettier --check --ignore-path ${gitIgnorePath} .`
$`prettier-package-json --list-different ./package.json`
