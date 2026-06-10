import type { ActivitySeverity } from '@twin-digital/grinbox-server'
import { AlertCircle, AlertTriangle } from 'lucide-react'

import { cn } from '../lib/utils.js'

/**
 * Activity-Log severity indicator: a colored icon + label (ui-design.md
 * "Activity Log" + "Status indicators"). Shares the semantic status palette with
 * the Triage / Account indicators — `warning` is the amber Limit-hit tone,
 * `error` the red failure tone — rather than duplicating the colors:
 *
 *  - `warning` → amber, a Resource-op Limit hit
 *  - `error`   → red, a failure (Resource-op failure or failed Operator run)
 *
 * The icon is decorative (the label carries the meaning for assistive tech).
 */

interface SeverityMeta {
  readonly label: string
  /** CSS var driving the icon + label color (shared status tokens). */
  readonly color: string
  readonly icon: typeof AlertTriangle
}

const SEVERITY_META: Record<ActivitySeverity, SeverityMeta> = {
  warning: {
    label: 'Limit hit',
    color: 'var(--warning)',
    icon: AlertTriangle,
  },
  error: {
    label: 'Error',
    color: 'var(--danger)',
    icon: AlertCircle,
  },
}

export function severityMeta(severity: ActivitySeverity): SeverityMeta {
  return SEVERITY_META[severity]
}

export function SeverityIndicator({ severity, className }: { severity: ActivitySeverity; className?: string }) {
  const meta = SEVERITY_META[severity]
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)} data-severity={severity}>
      <Icon aria-hidden='true' className='h-4 w-4 shrink-0' style={{ color: meta.color }} />
      <span className='font-medium' style={{ color: meta.color }}>
        {meta.label}
      </span>
    </span>
  )
}
