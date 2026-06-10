import type { ReactNode } from 'react'

import { cn } from '../lib/utils.js'

/**
 * Shell-stage page primitives. Pages are placeholders at W0 — a title plus a
 * one-line empty state. Per-area content lands in later tasks.
 */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-8 py-8', className)}>{children}</div>
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className='mb-8'>
      <h1 className='text-3xl font-semibold tracking-tight'>{title}</h1>
      {description ?
        <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
      : null}
    </header>
  )
}

/**
 * Quietly-helpful empty state (ui-design.md "Empty states": `:)` headline + one
 * line of guidance). Used by placeholder pages and the Metrics "Coming soon".
 */
export function EmptyState({ headline = ':)', message }: { headline?: string; message: string }) {
  return (
    <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
      <p className='text-xl font-medium'>{headline}</p>
      <p className='mt-2 max-w-md text-sm text-muted-foreground'>{message}</p>
    </div>
  )
}
