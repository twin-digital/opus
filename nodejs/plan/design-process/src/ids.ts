import { randomInt } from 'node:crypto'

import type { FileTree } from './tree.js'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export type IdKind = 'r' | 'd' | 'q'

/** Every id-shaped token mentioned anywhere under products/ — declarations and citations alike. */
export const collectIds = (tree: FileTree): Set<string> => {
  const ids = new Set<string>()
  for (const path of tree
    .paths()
    .filter((p) => p.startsWith('products/') && (p.endsWith('.yaml') || p.endsWith('.yml')))) {
    for (const match of tree.read(path).matchAll(/\b[rdq]-[0-9a-z]{8}\b/g)) {
      ids.add(match[0])
    }
  }
  return ids
}

/** Generate opaque ids — {prefix}-{8 random lowercase base36 characters} — avoiding the taken set. */
export const generateIds = (kind: IdKind, count: number, taken: ReadonlySet<string>): string[] => {
  const generated: string[] = []
  const seen = new Set(taken)
  while (generated.length < count) {
    const id = `${kind}-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`
    if (!seen.has(id)) {
      seen.add(id)
      generated.push(id)
    }
  }
  return generated
}
