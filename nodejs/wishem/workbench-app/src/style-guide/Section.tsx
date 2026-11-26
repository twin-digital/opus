import type { ReactNode } from 'react'
import { ThemeScope, type Theme } from '../components/ThemeScope.js'

export interface SectionProps {
  /**
   * Names the section, for example "tokens". The scopes get the test ids `<id>-light` and `<id>-dark`.
   */
  id: string
  title: string
  children: ReactNode
  /**
   * `columns` draws the two scopes side by side from 900 pixels. `stacked` draws them one above the other.
   */
  layout?: 'columns' | 'stacked'
}

const themes: readonly Theme[] = ['light', 'dark']

/**
 * A style guide section, drawn once in a light scope and once in a dark scope.
 */
export const Section = ({ id, title, children, layout = 'columns' }: SectionProps) => (
  <section aria-labelledby={`${id}-title`} className='grid gap-4'>
    <h2 id={`${id}-title`} className='border-b border-line pb-2 font-display text-h2 font-extrabold'>
      {title}
    </h2>
    <div className={layout === 'columns' ? 'grid gap-4 min-[900px]:grid-cols-2' : 'grid gap-4'}>
      {themes.map((theme) => (
        <div key={theme} className='overflow-hidden rounded-md border border-line'>
          <ThemeScope theme={theme} testId={`${id}-${theme}`}>
            <div className='grid gap-5 p-6'>{children}</div>
          </ThemeScope>
        </div>
      ))}
    </div>
  </section>
)
