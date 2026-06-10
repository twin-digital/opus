import { Check, Moon, Sun, SunMoon } from 'lucide-react'

import { Button } from './ui/button.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.js'
import { type Theme, useTheme } from '../lib/theme.js'

const OPTIONS: readonly { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/**
 * Theme control. Quick-toggles light/dark on click via the dropdown options;
 * `system` follows the OS preference. The chosen mode persists to localStorage
 * (see lib/theme.tsx) and sets the `.dark` class on <html>.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='text-muted-foreground'
          title='Toggle theme'
          aria-label='Toggle theme'
        >
          {resolvedTheme === 'dark' ?
            <Moon />
          : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              setTheme(option.value)
            }}
          >
            {option.value === 'system' ?
              <SunMoon />
            : null}
            {option.value === 'light' ?
              <Sun />
            : null}
            {option.value === 'dark' ?
              <Moon />
            : null}
            <span className='flex-1'>{option.label}</span>
            {theme === option.value ?
              <Check className='opacity-60' />
            : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
