/**
 * A small badge marking a Message's backend disposition when it is no longer in
 * the inbox. Renders nothing for `present` (the common case), so callers can drop
 * it inline without a guard. Used in the Inbox list rows and the Message detail
 * header to make stale (archived/trashed/deleted) Messages obvious.
 */

const LABELS: Record<string, string> = {
  archived: 'Archived',
  trashed: 'Trashed',
  spam: 'Spam',
  deleted: 'Deleted',
}

export function SourceStateBadge({ state, className = '' }: { state: string; className?: string }) {
  if (!state || state === 'present') {
    return null
  }
  const label = LABELS[state] ?? state
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${className}`}
      title={`No longer in the inbox (${label.toLowerCase()})`}
    >
      {label}
    </span>
  )
}
