import type { PendingArchiveSummary } from '@grinbox/server'
import { Clock } from 'lucide-react'

import { absoluteTime, timeUntil } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The pending Archive a Message holds — an Archive its latest settled Triage
 * recorded and grinbox still owes it (d-p0ea1t8q). Every read surface a Message
 * appears on carries it while it stands, so what a re-Triage would cancel is
 * visible before it fires; the API omits it (`null`) the moment it fires, is
 * cancelled, or is superseded, so anything rendered here is still ahead.
 *
 * The list row takes {@link PendingArchiveBadge} (the due moment, compact) and
 * Message detail takes {@link PendingArchiveNotice} (the due moment, the
 * recording Triage, and the lever that cancels it).
 */

/** Compact row indication: a clock and the countdown, absolute moment on hover. */
export function PendingArchiveBadge({ pending, className }: { pending: PendingArchiveSummary; className?: string }) {
  return (
    <span
      data-testid='pending-archive-badge'
      title={`Leaves the inbox ${absoluteTime(pending.due_at)}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <Clock className='h-3 w-3' />
      Archives {timeUntil(pending.due_at)}
    </span>
  )
}

/**
 * Message detail's statement of the pending Archive: when it comes due, which
 * Triage recorded it (selectable in the Triage history), and that re-triaging is
 * what cancels it (d-0tajzoy7 — the latest settled Triage's conclusion is what
 * stands).
 */
export function PendingArchiveNotice({
  pending,
  onSelectTriage,
}: {
  pending: PendingArchiveSummary
  onSelectTriage: (triageId: number) => void
}) {
  return (
    <div
      data-testid='pending-archive-notice'
      className='mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm'
    >
      <span className='inline-flex items-center gap-1.5 font-medium'>
        <Clock className='h-4 w-4' />
        Archives {timeUntil(pending.due_at)}
      </span>
      <p className='mt-1 text-xs text-muted-foreground'>
        This Message leaves the inbox {absoluteTime(pending.due_at)}, scheduled by{' '}
        <button
          type='button'
          className='underline underline-offset-2 hover:text-foreground'
          onClick={() => {
            onSelectTriage(pending.triage_id)
          }}
        >
          Triage {pending.triage_id}
        </button>
        . Replaying the Message re-triages it, which cancels or replaces what is pending.
      </p>
    </div>
  )
}
