import type { ReactNode } from 'react'

export interface SpecimenProps {
  /**
   * Names the specimen. It is the name of the region and the small label above it.
   */
  label: string
  children: ReactNode
}

/**
 * Holds one specimen. A header in a section is not a banner landmark.
 */
export const Specimen = ({ label, children }: SpecimenProps) => (
  <section aria-label={label} className='grid gap-2'>
    <span className='font-mono text-label font-medium text-fg-muted uppercase'>{label}</span>
    <div className='overflow-hidden rounded-md border border-line'>{children}</div>
  </section>
)
