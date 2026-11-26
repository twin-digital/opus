import type { ReactNode } from 'react'
import type { Status } from './Callout.js'

export type BadgeVariant = 'neutral' | 'maker' | 'spirit' | 'accent' | Status

export interface BadgeProps {
  /**
   * Default: `neutral`.
   */
  variant?: BadgeVariant
  children: ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'text-fg-muted border-[color-mix(in_srgb,var(--fg-muted)_50%,transparent)]',
  maker: 'text-maker-text border-[color-mix(in_srgb,var(--maker-text)_50%,transparent)]',
  spirit: 'text-spirit-text border-[color-mix(in_srgb,var(--spirit-text)_50%,transparent)]',
  accent: 'text-accent-text border-[color-mix(in_srgb,var(--accent-text)_50%,transparent)]',
  success: 'text-success-text border-[color-mix(in_srgb,var(--success-text)_50%,transparent)]',
  warning: 'text-warning-text border-[color-mix(in_srgb,var(--warning-text)_50%,transparent)]',
  danger: 'text-danger-text border-[color-mix(in_srgb,var(--danger-text)_50%,transparent)]',
  info: 'text-info-text border-[color-mix(in_srgb,var(--info-text)_50%,transparent)]',
}

/**
 * One short text on one line, as a pill.
 */
export const Badge = ({ variant = 'neutral', children }: BadgeProps) => (
  <span
    className={`inline-block rounded-full border px-[7px] py-0.5 font-mono text-[11px] font-medium tracking-[0.06em] whitespace-nowrap uppercase ${variantClass[variant]}`}
  >
    {children}
  </span>
)
