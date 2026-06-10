import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

import { Sidebar } from './components/sidebar.js'
import { AccountDetailPage } from './pages/accounts/detail.js'
import { AccountsListPage } from './pages/accounts/list.js'
import { ActivityPage } from './pages/activity/list.js'
import { validateActivitySearch } from './pages/activity/search.js'
import { DashboardPage } from './pages/dashboard.js'
import { MessageDetailPage } from './pages/inbox/detail.js'
import { InboxPage } from './pages/inbox/list.js'
import { validateInboxSearch } from './pages/inbox/search.js'
import { PipelineDetailPage } from './pages/pipelines/detail.js'
import { PipelinesListPage } from './pages/pipelines/list.js'
import { MetricsPage } from './pages/placeholders.js'
import { SettingsAboutPage, SettingsCredentialsPage, SettingsLayout, SettingsLimitsPage } from './pages/settings.js'

/**
 * Code-based TanStack Router tree. The root route is the app shell — persistent
 * sidebar + content outlet — and every area hangs off it. Detail routes
 * (`$messageId`, `$pipelineId`, `$accountId`) keep their parent area highlighted
 * in the sidebar. Settings owns a nested layout with its own sub-sidebar and a
 * `/settings` → `/settings/limits` index redirect. Route order mirrors the
 * ui-design.md Sitemap.
 */

const rootRoute = createRootRoute({
  component: function RootLayout() {
    return (
      <div className='flex min-h-screen bg-background text-foreground'>
        <Sidebar />
        <main className='min-w-0 flex-1 overflow-y-auto'>
          <Outlet />
        </main>
      </div>
    )
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  component: InboxPage,
  validateSearch: (search: Record<string, unknown>) => validateInboxSearch(search),
})

const messageDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox/$messageId',
  component: MessageDetailPage,
})

const pipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pipelines',
  component: PipelinesListPage,
})

const pipelineDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pipelines/$pipelineId',
  component: PipelineDetailPage,
})

const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts',
  component: AccountsListPage,
})

const accountDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts/$accountId',
  component: AccountDetailPage,
})

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  component: ActivityPage,
  validateSearch: (search: Record<string, unknown>) => validateActivitySearch(search),
})

const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/metrics',
  component: MetricsPage,
})

// Settings: a layout route with the internal sub-sidebar, an index redirect to
// the first section, and one child per section.
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: () => {
    // TanStack Router redirects flow by throwing a non-Error control object.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/settings/limits' })
  },
})

const settingsLimitsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'limits',
  component: SettingsLimitsPage,
})

const settingsCredentialsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'credentials',
  component: SettingsCredentialsPage,
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'about',
  component: SettingsAboutPage,
})

export const routeTree = rootRoute.addChildren([
  dashboardRoute,
  inboxRoute,
  messageDetailRoute,
  pipelinesRoute,
  pipelineDetailRoute,
  accountsRoute,
  accountDetailRoute,
  activityRoute,
  metricsRoute,
  settingsRoute.addChildren([settingsIndexRoute, settingsLimitsRoute, settingsCredentialsRoute, settingsAboutRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
