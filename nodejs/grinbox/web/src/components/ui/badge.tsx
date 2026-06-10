import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '../../lib/utils.js'

/**
 * Pill badge. Used for the "no Pipeline assigned" warning chip and other small
 * status/label pills. Semantic status variants map to the amber/emerald/red
 * tokens (ui-design.md "Status colors"); the default/outline variants use the
 * neutral palette.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        warning: 'border-transparent bg-warning/15 text-warning-foreground [color:var(--warning)]',
        success: 'border-transparent bg-success/15 [color:var(--success)]',
        danger: 'border-transparent bg-danger/15 [color:var(--danger)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
