import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Adventure, Approach } from '@thrashplay/fw-simulation'
import { parse } from 'yaml'

/**
 * A per-adventure diversity palette for the `treatment` pre-pass. Every model collapses each
 * adventure's setting toward its own prototype (Sonnet → archives, gemma → ossuaries, …) because the
 * mechanical skeleton gives it no distinguishing signal; this injects one. `biome`/`scale`/
 * `inhabitants` are rolled freely (seeded deterministically off the adventure, so a seed is stable),
 * while `adventureType` is derived from the goal + the trials' approaches so it stays honest to the
 * dice. The vocabulary is the editable `palette.yaml`.
 */
export interface Palette {
  readonly biome: string
  readonly scale: string
  readonly inhabitants: string
  readonly adventureType: string
}

interface PaletteVocab {
  readonly biomes: readonly string[]
  readonly scales: readonly string[]
  readonly inhabitants: readonly string[]
  readonly adventureTypes: Readonly<Record<string, string>>
}

const PALETTE_PATH = join(import.meta.dirname, '..', 'palette.yaml')

const loadVocab = (): PaletteVocab => {
  const loaded: unknown = parse(readFileSync(PALETTE_PATH, 'utf8'))
  return loaded as PaletteVocab
}

/** Which adventure-type category each approach speaks to. */
const APPROACH_CATEGORY: Record<Approach, string> = {
  combat: 'force',
  might: 'force',
  intimidation: 'force',
  stealth: 'guile',
  cunning: 'guile',
  deception: 'guile',
  evasion: 'guile',
  diplomacy: 'social',
  charm: 'social',
  performance: 'social',
  lore: 'lore',
  insight: 'lore',
  ritual: 'lore',
  magic: 'lore',
  endurance: 'grit',
  resolve: 'grit',
  speed: 'grit',
  agility: 'grit',
  craft: 'grit',
  preparation: 'grit',
  wealth: 'grit',
  sacrifice: 'grit',
}

/** Category order — also the deterministic tiebreak when two categories tie on count. */
const CATEGORY_ORDER = ['force', 'guile', 'social', 'lore', 'grit'] as const

/** Deterministic djb2 string hash → unsigned 32-bit, so a given adventure always rolls the same. */
const hash = (text: string): number => {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) {
    h = (((h << 5) + h + text.charCodeAt(i)) & 0xffffffff) >>> 0
  }
  return h
}

/** The dominant approach-category across the trials (ties broken by {@link CATEGORY_ORDER}). */
const dominantCategory = (adventure: Adventure): string => {
  const counts = new Map<string, number>()
  for (const trial of adventure.trials) {
    const category = APPROACH_CATEGORY[trial.approach]
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return CATEGORY_ORDER.reduce((best, category) =>
    (counts.get(category) ?? 0) > (counts.get(best) ?? 0) ? category : best,
  )
}

/** Derive the diversity palette for an adventure: scenery rolled (seeded), expedition-shape derived. */
export const derivePalette = (adventure: Adventure): Palette => {
  const vocab = loadVocab()
  const base = JSON.stringify(adventure)
  const roll = (list: readonly string[], dimension: string): string => list[hash(base + dimension) % list.length]

  const kind = adventure.goal.reward.kind
  const category = kind === 'secret' || kind === 'lore' ? 'lore' : dominantCategory(adventure)

  return {
    biome: roll(vocab.biomes, 'biome'),
    scale: roll(vocab.scales, 'scale'),
    inhabitants: roll(vocab.inhabitants, 'inhabitants'),
    adventureType: vocab.adventureTypes[category] ?? vocab.adventureTypes.grit,
  }
}
