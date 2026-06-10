import { Link, Outlet, useRouterState } from '@tanstack/react-router'

import { PageHeader } from '../components/page.js'
import { SETTINGS_NAV_ITEMS } from '../lib/nav.js'
import { cn } from '../lib/utils.js'

/**
 * Settings layout with the internal sub-sidebar (ui-design.md "Settings"). The
 * outer left sidebar persists; this secondary nav switches between
 * Limits / Notification credentials / About, each its own `/settings/<section>`
 * route rendered through the nested <Outlet>.
 */
export function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className='mx-auto w-full max-w-6xl px-8 py-8'>
      <PageHeader title='Settings' />
      <div className='flex gap-8'>
        <nav aria-label='Settings' className='w-56 flex-none space-y-0.5'>
          {SETTINGS_NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  active ?
                    'bg-violet-50 font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className='min-w-0 flex-1'>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export { SettingsLimitsPage } from './settings/limits.js'
export { SettingsCredentialsPage } from './settings/credentials.js'
export { SettingsAboutPage } from './settings/about.js'
