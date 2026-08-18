import type { AccountStatus } from '@grinbox/server'

import { cn } from '@/lib/utils'

/**
 * Status indicator: a colored dot + label (ui-design.md "Status indicators").
 * Maps an Account's derived status onto a semantic color + human label:
 *
 *  - `ok`         → emerald "OK"
 *  - `needs_auth` → amber "Needs authorization"
 *  - `no_pipeline`→ amber "No Pipeline assigned"
 *  - `paused`     → amber "Paused — needs attention"
 *
 * `paused` is polling stopped until the user acts: an IMAP server refused the
 * stored password and said the credential is what it refused (d-v4mejzw5).
 * `needs_auth` is the Account holding no live credential of its backend's own
 * kind (d-hinqfmdf) — the two are different repairs, so they read differently.
 *
 * The dot color uses the semantic status CSS tokens (`--success` / `--warning`),
 * distinct from the violet accent.
 */

interface StatusMeta {
  readonly label: string
  /** CSS var driving the dot fill. */
  readonly color: string
  /** Tailwind text class for the label. */
  readonly text: string
}

const STATUS_META: Record<AccountStatus, StatusMeta> = {
  ok: {
    label: 'OK',
    color: 'var(--success)',
    text: '[color:var(--success)]',
  },
  needs_auth: {
    label: 'Needs authorization',
    color: 'var(--warning)',
    text: '[color:var(--warning)]',
  },
  paused: {
    label: 'Paused — needs attention',
    color: 'var(--warning)',
    text: '[color:var(--warning)]',
  },
  no_pipeline: {
    label: 'No Pipeline assigned',
    color: 'var(--warning)',
    text: '[color:var(--warning)]',
  },
}

export function StatusIndicator({ status, className }: { status: AccountStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', className)} data-status={status}>
      <span
        aria-hidden='true'
        className='inline-block h-2 w-2 shrink-0 rounded-full'
        style={{ backgroundColor: meta.color }}
      />
      <span className={cn('font-medium', meta.text)}>{meta.label}</span>
    </span>
  )
}
