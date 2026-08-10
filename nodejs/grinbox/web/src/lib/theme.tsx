import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Theme state. `theme` is the user's stored preference (`light` / `dark` /
 * `system`); the resolved mode is whatever class lands on <html>. Default is
 * `system`, which follows the OS `prefers-color-scheme`. The choice persists to
 * localStorage under `STORAGE_KEY`; index.html applies the same resolution
 * pre-paint to avoid a flash.
 */
export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'grinbox-theme'

interface ThemeContextValue {
  theme: Theme
  /** The mode actually applied to <html> after resolving `system`. */
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'system'
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return prefersDark() ? 'dark' : 'light'
  }
  return theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolve(readStoredTheme()))

  // Apply the resolved mode to <html> whenever the preference changes, and keep
  // it in sync with OS changes while in `system` mode.
  useEffect(() => {
    const apply = () => {
      const next = resolve(theme)
      setResolvedTheme(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
    }
    apply()

    if (theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => {
      media.removeEventListener('change', apply)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = resolve(current) === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
