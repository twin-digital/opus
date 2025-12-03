#!/usr/bin/env node

import { $ } from '../lib/util/shell.js'

const gitIgnorePath = '../../../.gitignore'
const prettierIgnorePath = '../../../.prettierignore'

$`eslint --no-error-on-unmatched-pattern --ignore-pattern node_modules/ .`
$`prettier --check --ignore-path ${gitIgnorePath} --ignore-path ${prettierIgnorePath} .`
$`prettier-package-json --list-different ./package.json`
