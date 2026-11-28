import { createContext, useContext, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

export interface ThemeScopeProps {
  /**
   * Forces this theme on the content.
   */
  theme: Theme
  children: ReactNode
  /**
   * Test id of the scope element.
   */
  testId?: string
}

const ThemeScopeElement = createContext<HTMLElement | null>(null)

/**
 * The element of the nearest ThemeScope, or `null` when there is none.
 * A popup draws itself in this element, so it gets the theme of its control.
 */
export const useThemeScopeElement = () => useContext(ThemeScopeElement)

/**
 * Shows its content in one theme, whatever the color scheme of the system is.
 */
export const ThemeScope = ({ theme, children, testId }: ThemeScopeProps) => {
  const [element, setElement] = useState<HTMLElement | null>(null)
  return (
    <div ref={setElement} data-theme={theme} data-testid={testId} className='relative bg-ground text-fg'>
      <ThemeScopeElement value={element}>{children}</ThemeScopeElement>
    </div>
  )
}
