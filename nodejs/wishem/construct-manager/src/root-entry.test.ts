import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import * as node from './node.js'
import * as root from './index.js'

const ALLOWED = ['@thrashplay/wishem-core', '@thrashplay/wishem-hub']
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s[^;']*?from\s+'([^']+)'|(?:^|\n)\s*import\s+'([^']+)'/g

const specifiersOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((match) => match.slice(1).find(Boolean) ?? '')

/** Reads `file` and each module that it imports with a relative path. */
const modulesOf = (file: string, seen = new Set<string>()): Map<string, string[]> => {
  const found = new Map<string, string[]>()
  if (seen.has(file)) {
    return found
  }
  seen.add(file)
  const specifiers = specifiersOf(file)
  found.set(file, specifiers)
  for (const specifier of specifiers.filter((item) => item.startsWith('.'))) {
    const next = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'))
    modulesOf(next, seen).forEach((value, key) => found.set(key, value))
  }
  return found
}

it('imports no Node.js module and no package other than core and hub', () => {
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), 'index.ts')
  const modules = modulesOf(entry)
  expect(modules.size).toBeGreaterThan(2)
  const bad = [...modules.entries()].flatMap(([file, specifiers]) =>
    specifiers
      .filter((specifier) => !specifier.startsWith('.') && !ALLOWED.includes(specifier))
      .map((specifier) => `${file}: ${specifier}`),
  )
  expect(bad).toEqual([])
})

it('exports these names from the root entry', () => {
  expect(Object.keys(root).sort()).toEqual([
    'CONSTRUCTS_ID',
    'CONSTRUCT_MANAGER_ID',
    'CONSTRUCT_MANAGER_READER_ID',
    'constructInputs',
    'createConstructList',
    'productChanges',
  ])
})

it('exports these names from the node entry', () => {
  expect(Object.keys(node).sort()).toEqual([
    'attachConstructManager',
    'checkProductCode',
    'childProcessLauncher',
    'inProcessLauncher',
    'startProductConstruct',
  ])
})
