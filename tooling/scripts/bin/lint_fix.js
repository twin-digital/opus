#!/usr/bin/env node

import { $ } from '../lib/util/shell.js'

const gitIgnorePath = '../../../.gitignore'
const prettierIgnorePath = '../../../.prettierignore'

$`eslint --no-error-on-unmatched-pattern --fix src`
$`prettier --write --ignore-path ${gitIgnorePath} --ignore-path ${prettierIgnorePath} .`
$`prettier-package-json --write ./package.json`
