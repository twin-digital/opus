import type { ReactNode } from 'react'

export interface PanelProps {
  /**
   * Drawn as a heading 2.
   */
  title?: string
  /**
   * Content at the end of the header, for example a badge.
   */
  headerEnd?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

/**
 * A `surface` box with a body, an optional header, and an optional footer. The header shows when the panel has a
 * title or header content. The footer puts its content at the end of the line.
 */
export const Panel = ({ title, headerEnd, footer, children }: PanelProps) => {
  const hasHeader = title !== undefined || (headerEnd !== undefined && headerEnd !== null && headerEnd !== false)
  const hasFooter = footer !== undefined && footer !== null && footer !== false
  return (
    <div className='flex min-w-0 flex-col rounded-md border border-line bg-surface shadow-sm'>
      {hasHeader && (
        <div data-slot='header' className='flex items-center gap-2 border-b border-line px-3 py-2'>
          {title !== undefined && <h2 className='min-w-0 truncate text-control font-semibold'>{title}</h2>}
          {headerEnd !== undefined && <div className='ml-auto shrink-0'>{headerEnd}</div>}
        </div>
      )}
      <div data-slot='body' className='grid grid-cols-[minmax(0,1fr)] gap-2.5 p-3'>
        {children}
      </div>
      {hasFooter && (
        <div data-slot='footer' className='flex flex-wrap justify-end gap-2 border-t border-line px-3 py-2'>
          {footer}
        </div>
      )}
    </div>
  )
}
