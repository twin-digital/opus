import { foldProduct } from './fold.js'

import type { Fold, FoldedClaim } from './fold.js'
import type { Product, ProductsTree } from './load.js'
import type { Finding, PresetEntry, RequirementEntry } from './types.js'

/** One preset in a closure, at the version every path to it pinned. */
export interface AdoptedPreset {
  name: string
  version: number
  /** The preset's own requirements in force at `version`; the presets it adopts are separate entries. */
  requirements: Map<string, FoldedClaim<RequirementEntry>>
  /** The adopting product, then the preset names down to this one. */
  via: string[]
}

export interface PresetClosure {
  /** Every preset the declarations reach, deduplicated by name, in the order the walk first met them. */
  presets: AdoptedPreset[]
  findings: Finding[]
}

/**
 * Walk the presets a product adopts, and the presets those adopt, into the closure its declarations
 * reach (d-wis1whfn). A preset met by more than one path appears once; a cycle and a preset pinned
 * at two versions are findings, since neither resolves to a closure.
 */
export const resolvePresetClosure = (product: Product, productsTree: ProductsTree, fold: Fold): PresetClosure => {
  const presets: AdoptedPreset[] = []
  const byName = new Map<string, AdoptedPreset>()
  const findings: Finding[] = []

  const adoptedIn = (entries: Iterable<FoldedClaim<PresetEntry>>): PresetEntry[] =>
    [...entries].map((claim) => claim.entry).filter((entry) => (entry.status ?? 'adopted') === 'adopted')

  const visit = (entries: PresetEntry[], trail: string[]) => {
    for (const entry of entries) {
      const path = [...trail, entry.name]
      if (trail.includes(entry.name)) {
        findings.push({
          rule: 'preset-cycle',
          claims: ['d-wis1whfn'],
          path: product.dir,
          message: `preset adoption cycles: ${path.join(' → ')}`,
        })
        continue
      }
      if (entry.version === undefined) {
        continue // preset-version-published reports the unpinned hop
      }
      const seen = byName.get(entry.name)
      if (seen) {
        if (seen.version !== entry.version) {
          findings.push({
            rule: 'preset-version-conflict',
            claims: ['d-wis1whfn'],
            path: product.dir,
            message: `${entry.name} is reached at version ${seen.version} by ${seen.via.join(' → ')} and at version ${entry.version} by ${path.join(' → ')}`,
          })
        }
        continue
      }
      const presetProduct = productsTree.products.get(entry.name)
      if (!presetProduct) {
        continue // preset-resolves reports the dangling name
      }
      const presetFold = foldProduct(presetProduct, entry.version)
      const adopted: AdoptedPreset = {
        name: entry.name,
        version: entry.version,
        requirements: presetFold.requirements,
        via: path,
      }
      byName.set(entry.name, adopted)
      presets.push(adopted)
      visit(adoptedIn(presetFold.presets.values()), path)
    }
  }

  visit(adoptedIn(fold.presets.values()), [product.id])
  return { presets, findings }
}

/** Every requirement id the closure contributes, deduplicated across the paths that reach it. */
export const closureRequirementIds = (closure: PresetClosure): Set<string> => {
  const ids = new Set<string>()
  for (const preset of closure.presets) {
    for (const id of preset.requirements.keys()) {
      ids.add(id)
    }
  }
  return ids
}
