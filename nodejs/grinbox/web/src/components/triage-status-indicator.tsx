import { cn } from '../lib/utils.js'

/**
 * Triage / Operator-run status indicator: a colored dot + label (ui-design.md
 * "Status indicators"). Distinct from the Account {@link StatusIndicator}; this
 * maps the Triage + Operator-run vocabulary onto semantic colors:
 *
 *  - `completed` → emerald
 *  - `partial`   → amber (a Limit was hit / partial result)
 *  - `failed`    → red
 *  - `running`   → pulsing zinc-400
 *  - `pending`   → zinc-300
 *  - `skipped`   → outline-only
 *
 * Unknown statuses fall back to a neutral dot + the raw label, so a new
 * server-side status never renders blank.
 */

interface StatusMeta {
  readonly label: string
  /** CSS var (or literal color) driving the dot fill; null = outline-only. */
  readonly color: string | null
  /** Tailwind text class for the label. */
  readonly text: string
  /** Whether the dot pulses (running). */
  readonly pulse?: boolean
}

const STATUS_META: Record<string, StatusMeta> = {
  completed: {
    label: 'Completed',
    color: 'var(--success)',
    text: '[color:var(--success)]',
  },
  partial: {
    label: 'Partial',
    color: 'var(--warning)',
    text: '[color:var(--warning)]',
  },
  failed: {
    label: 'Failed',
    color: 'var(--danger)',
    text: '[color:var(--danger)]',
  },
  running: {
    label: 'Running',
    color: 'var(--muted-foreground)',
    text: 'text-muted-foreground',
    pulse: true,
  },
  pending: {
    label: 'Pending',
    color: 'var(--muted-foreground)',
    text: 'text-muted-foreground',
  },
  skipped: {
    label: 'Skipped',
    color: null,
    text: 'text-muted-foreground',
  },
}

function metaFor(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      color: 'var(--muted-foreground)',
      text: 'text-muted-foreground',
    }
  )
}

export function TriageStatusIndicator({ status, className }: { status: string; className?: string }) {
  const meta = metaFor(status)
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', className)} data-status={status}>
      <span
        aria-hidden='true'
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          meta.color === null && 'border border-muted-foreground',
          meta.pulse && 'animate-pulse',
        )}
        style={meta.color === null ? undefined : { backgroundColor: meta.color }}
      />
      <span className={cn('font-medium', meta.text)}>{meta.label}</span>
    </span>
  )
}
