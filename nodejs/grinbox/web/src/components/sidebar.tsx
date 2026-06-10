import { Link, useRouterState } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ThemeToggle } from './theme-toggle.js'
import { Button } from './ui/button.js'
import { NAV_ITEMS, type NavItem } from '../lib/nav.js'
import { cn } from '../lib/utils.js'

const COLLAPSE_KEY = 'grinbox-sidebar-collapsed'
const MD_BREAKPOINT = 768

function readCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.innerWidth < MD_BREAKPOINT) {
    return true
  }
  return window.localStorage.getItem(COLLAPSE_KEY) === 'true'
}

/**
 * Persistent left sidebar (ui-design.md "Sidebar nav"): 240px expanded / 56px
 * icon-only, user toggle persisted to localStorage, Lucide icons, active-route
 * highlight, and the theme toggle in the footer. Auto-collapses below `md`.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  // Auto-collapse below md. A manual toggle still wins until the viewport
  // crosses the breakpoint again.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < MD_BREAKPOINT) {
        setCollapsed(true)
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(COLLAPSE_KEY, String(next))
      return next
    })
  }

  return (
    <nav
      data-collapsed={collapsed}
      aria-label='Primary'
      className={cn(
        'flex h-screen flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 flex-none items-center border-b border-sidebar-border px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <div className='flex h-7 w-7 flex-none items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-semibold text-white'>
          G
        </div>
        {!collapsed && <span className='ml-2 font-semibold'>Grinbox</span>}
      </div>

      <ul className='flex-1 space-y-0.5 overflow-y-auto p-2 text-sm'>
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      <div
        className={cn(
          'flex flex-none items-center border-t border-sidebar-border p-2',
          collapsed ? 'flex-col gap-1' : 'justify-between',
        )}
      >
        <Button
          variant='ghost'
          size='icon'
          className='text-muted-foreground'
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ?
            <PanelLeftOpen />
          : <PanelLeftClose />}
        </Button>
        <ThemeToggle />
      </div>
    </nav>
  )
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  // Highlight the active area. The root ('/') matches exactly; the others match
  // their path prefix so detail routes keep the parent highlighted.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)

  const Icon = item.icon

  if (item.comingSoon) {
    return (
      <span
        title={`${item.label} — coming soon`}
        className={cn(
          'flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground',
          collapsed && 'justify-center px-0',
        )}
      >
        <Icon className='h-4 w-4 flex-none' />
        {!collapsed && (
          <>
            <span className='flex-1'>{item.label}</span>
            <span className='text-[10px] uppercase tracking-wide'>soon</span>
          </>
        )}
      </span>
    )
  }

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        collapsed && 'justify-center px-0',
        active ?
          'bg-violet-50 font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
        : 'text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className='h-4 w-4 flex-none' />
      {!collapsed && <span className='flex-1'>{item.label}</span>}
    </Link>
  )
}
