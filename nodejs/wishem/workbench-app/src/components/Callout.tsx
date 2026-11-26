import type { ReactNode } from 'react'

export type Status = 'success' | 'warning' | 'danger' | 'info'

export interface CalloutProps {
  variant: Status
  title?: string
  children: ReactNode
}

const variantClass: Record<Status, { box: string; title: string }> = {
  success: {
    box: 'border-s-success border-[color-mix(in_srgb,var(--success)_45%,var(--line))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]',
    title: 'text-success-text',
  },
  warning: {
    box: 'border-s-warning border-[color-mix(in_srgb,var(--warning)_45%,var(--line))] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]',
    title: 'text-warning-text',
  },
  danger: {
    box: 'border-s-danger border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
    title: 'text-danger-text',
  },
  info: {
    box: 'border-s-info border-[color-mix(in_srgb,var(--info)_45%,var(--line))] bg-[color-mix(in_srgb,var(--info)_10%,transparent)]',
    title: 'text-info-text',
  },
}

/**
 * A status message with an optional bold title before the content.
 */
export const Callout = ({ variant, title, children }: CalloutProps) => (
  <div className={`rounded-md border border-s-[3px] px-3 py-2 break-words text-fg ${variantClass[variant].box}`}>
    {title !== undefined && title !== '' && (
      <div data-slot='title' className={`font-bold ${variantClass[variant].title}`}>
        {title}
      </div>
    )}
    <div>{children}</div>
  </div>
)
