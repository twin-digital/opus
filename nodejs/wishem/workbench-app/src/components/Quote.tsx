import type { ReactNode } from 'react'

export interface QuoteProps {
  children: ReactNode
  /**
   * The source, shown below the text.
   */
  cite?: string
}

/**
 * Italic text with a bar in `accent` at its start, and an optional source below it.
 */
export const Quote = ({ children, cite }: QuoteProps) => (
  <blockquote className='border-s-[3px] border-accent py-0.5 ps-3.5 break-words italic'>
    {children}
    {cite !== undefined && cite !== '' && (
      <cite className='mt-1 block text-[12px] font-normal text-fg-muted not-italic'>{cite}</cite>
    )}
  </blockquote>
)
