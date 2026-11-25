import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark'

export interface ThemeScopeProps {
  /** Forces this theme on the content. */
  theme: Theme
  children: ReactNode
  /** Test id of the scope element. */
  testId?: string
}

/** Shows its content in one theme, whatever the color scheme of the system is. */
export const ThemeScope = ({ theme, children, testId }: ThemeScopeProps) => (
  <div data-theme={theme} data-testid={testId} className='bg-ground text-fg'>
    {children}
  </div>
)
