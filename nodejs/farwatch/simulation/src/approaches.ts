/**
 * The approaches a party can bring to bear on a trial — the method they (try to) overcome it with.
 * A mechanical skeleton only: it says *how* they engaged (a fight, a ruse, an outlasting), giving
 * the chronicler a concrete hook for variety, but carries no narrative texture itself. One is drawn
 * at random per trial for now — there are no seekers or stats yet to choose it.
 *
 * Kept in its own leaf module so the config schemas (which key tables by approach) can reference it
 * without importing the adventure resolver.
 */
export const APPROACHES = [
  'agility',
  'charm',
  'combat',
  'craft',
  'cunning',
  'deception',
  'diplomacy',
  'endurance',
  'evasion',
  'insight',
  'intimidation',
  'lore',
  'magic',
  'might',
  'performance',
  'preparation',
  'resolve',
  'ritual',
  'sacrifice',
  'speed',
  'stealth',
  'wealth',
] as const

/** How a party (tries to) overcome a trial. @see APPROACHES */
export type Approach = (typeof APPROACHES)[number]
