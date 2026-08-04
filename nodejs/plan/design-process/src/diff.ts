import { formatIncrement } from './version.js'

import type { Fold } from './fold.js'

export type ClaimKind = 'requirement' | 'decision'

export interface AddedClaim {
  id: string
  kind: ClaimKind
  title?: string
  increment: number
}

/** An entry the later fold closed: `by` names the replacement, or the retirement's reason. */
export interface ClosedClaim {
  id: string
  kind: ClaimKind
  by: string
  increment: number
}

export interface FoldDiff {
  product: string
  from: number
  to: number
  added: AddedClaim[]
  /** Requirements replaced by a later requirement's `amends:`. */
  amended: ClosedClaim[]
  /** Decisions replaced by a later decision's `supersedes:`. */
  superseded: ClosedClaim[]
  /** Entries closed by a `retires:` entry; `by` carries the recorded reason. */
  retired: ClosedClaim[]
}

/** What changed between two versions of a product's fold. The later version may not precede the earlier. */
export const diffFolds = (productId: string, from: Fold, to: Fold): FoldDiff => {
  if (to.at < from.at) {
    throw new Error(`the later version (${formatIncrement(to.at)}) precedes the earlier (${formatIncrement(from.at)})`)
  }
  const added: AddedClaim[] = []
  for (const [id, claim] of to.requirements) {
    if (!from.requirements.has(id)) {
      added.push({ id, kind: 'requirement', title: claim.entry.title, increment: claim.increment })
    }
  }
  for (const [id, claim] of to.decisions) {
    if (!from.decisions.has(id)) {
      added.push({ id, kind: 'decision', title: claim.entry.title, increment: claim.increment })
    }
  }

  const amended: ClosedClaim[] = []
  const superseded: ClosedClaim[] = []
  const retired: ClosedClaim[] = []
  for (const entry of to.outOfForce) {
    if (entry.increment <= from.at) {
      continue
    }
    const closed: ClosedClaim = { id: entry.id, kind: entry.kind, by: entry.by, increment: entry.increment }
    if (entry.how === 'retired') {
      retired.push(closed)
    } else if (entry.kind === 'requirement') {
      amended.push(closed)
    } else {
      superseded.push(closed)
    }
  }

  return { product: productId, from: from.at, to: to.at, added, amended, superseded, retired }
}

/** Render a fold diff as markdown, in the projection's idiom. Empty sections are omitted. */
export const renderFoldDiff = (diff: FoldDiff): string => {
  const lines = [`# ${diff.product}: ${formatIncrement(diff.from)} → ${formatIncrement(diff.to)}`, '']
  const total = diff.added.length + diff.amended.length + diff.superseded.length + diff.retired.length
  if (total === 0) {
    return `${lines.join('\n')}\n(no change)\n`
  }
  if (diff.added.length > 0) {
    lines.push(`## added (${diff.added.length})`, '')
    for (const claim of diff.added) {
      lines.push(
        `- ${claim.id} (${formatIncrement(claim.increment)}) [${claim.kind}]${claim.title === undefined ? '' : ` — ${claim.title}`}`,
      )
    }
    lines.push('')
  }
  const closures: [string, ClosedClaim[], (entry: ClosedClaim) => string][] = [
    ['amended', diff.amended, (entry) => `by ${entry.by}`],
    ['superseded', diff.superseded, (entry) => `by ${entry.by}`],
    ['retired', diff.retired, (entry) => `— ${entry.by}`],
  ]
  for (const [heading, entries, describe] of closures) {
    if (entries.length === 0) {
      continue
    }
    lines.push(`## ${heading} (${entries.length})`, '')
    for (const entry of entries) {
      lines.push(`- ${entry.id} (${formatIncrement(entry.increment)}) ${describe(entry)}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
