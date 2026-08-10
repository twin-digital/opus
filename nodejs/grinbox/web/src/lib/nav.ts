import { Activity, BarChart3, Inbox, LayoutDashboard, type LucideIcon, Mail, Settings, Workflow } from 'lucide-react'

/**
 * The seven top-level areas of the sidebar, in display order (ui-design.md
 * "Sitemap"). Icons match the style guide's Lucide mapping. `comingSoon` flags
 * Metrics, which renders a placeholder and is shown disabled in the nav.
 */
export interface NavItem {
  readonly label: string
  readonly to: string
  readonly icon: LucideIcon
  readonly comingSoon?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Inbox', to: '/inbox', icon: Inbox },
  { label: 'Pipelines', to: '/pipelines', icon: Workflow },
  { label: 'Accounts', to: '/accounts', icon: Mail },
  { label: 'Activity Log', to: '/activity', icon: Activity },
  { label: 'Settings', to: '/settings', icon: Settings },
  { label: 'Metrics', to: '/metrics', icon: BarChart3, comingSoon: true },
]

/** Settings internal sub-navigation (ui-design.md "Settings"). */
export interface SettingsNavItem {
  readonly label: string
  readonly to: string
}

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { label: 'Limits', to: '/settings/limits' },
  { label: 'Notification credentials', to: '/settings/credentials' },
  { label: 'About', to: '/settings/about' },
]
