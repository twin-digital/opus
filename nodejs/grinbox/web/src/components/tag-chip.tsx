import { cn } from '../lib/utils.js'

/**
 * Tag chip (ui-design.md "Tag chips"): a pill rendering `key: value` with the
 * key in muted weight and the value in regular-weight mono. The background color
 * is derived from `hash(key) % 8` of an 8-color palette so the same Tag key is
 * always the same color across the UI, while distinct keys spread across the
 * palette. Hovering reveals provenance (the producing Triage + Operator) via the
 * native `title` tooltip.
 *
 * In dense Inbox rows, render the 3 highest-priority chips + a `+N` overflow
 * chip; the full list shows on Message detail. The priority ordering is the
 * caller's responsibility (see {@link orderTagsByPriority}); this component just
 * renders one chip.
 */

/**
 * An 8-color palette in the Zinc/Violet scheme. Each entry pairs a translucent
 * background tint with a readable foreground, defined for both light and dark
 * mode via Tailwind `dark:` variants. Index is `hash(key) % 8`.
 */
const TAG_PALETTE: readonly string[] = [
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
]

/** Stable FNV-1a-ish hash over the key, reduced into the palette index. */
export function tagColorIndex(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // `>>> 0` to keep it unsigned before the modulo.
  return (hash >>> 0) % TAG_PALETTE.length
}

export interface TagChipProps {
  readonly tagKey: string
  readonly value: string
  /** Optional provenance string surfaced via the `title` hover tooltip. */
  readonly provenance?: string
  readonly className?: string
}

export function TagChip({ tagKey, value, provenance, className }: TagChipProps) {
  const palette = TAG_PALETTE[tagColorIndex(tagKey)]
  return (
    <span
      title={provenance}
      data-tag-key={tagKey}
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs', palette, className)}
    >
      <span className='font-normal opacity-70'>{tagKey}:</span>
      <span className='truncate font-mono font-normal'>{value}</span>
    </span>
  )
}

export interface PriorityTag {
  readonly key: string
  readonly value: string
}

/**
 * Order Tags for dense-row display. The Inbox list API does not expose the
 * producing Pipeline's tag-key registry order, so priority falls back to a
 * stable lexicographic order over `key` then `value` — deterministic across
 * renders. When a registry order *is* available (e.g. Message detail under a
 * single Pipeline), pass it as `keyPriority`; keys present in it sort first, in
 * its order, and any remaining keys keep the stable fallback.
 */
export function orderTagsByPriority<T extends PriorityTag>(tags: readonly T[], keyPriority?: readonly string[]): T[] {
  const rank = new Map<string, number>()
  keyPriority?.forEach((key, i) => {
    if (!rank.has(key)) {
      rank.set(key, i)
    }
  })
  return [...tags].sort((a, b) => {
    const ra = rank.get(a.key) ?? Number.POSITIVE_INFINITY
    const rb = rank.get(b.key) ?? Number.POSITIVE_INFINITY
    if (ra !== rb) {
      return ra - rb
    }
    if (a.key !== b.key) {
      return a.key < b.key ? -1 : 1
    }
    return (
      a.value < b.value ? -1
      : a.value > b.value ? 1
      : 0
    )
  })
}

/** The `+N` overflow chip shown after the first few Tag chips in dense rows. */
export function TagOverflowChip({ count, title, className }: { count: number; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      +{count}
    </span>
  )
}
