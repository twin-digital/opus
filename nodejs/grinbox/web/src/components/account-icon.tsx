/**
 * The per-Message source-account badge shown in the Inbox's left hanging-indent
 * column (and reused on the account list/detail). It marks which account a
 * Message came from so interleaved multi-account lists stay scannable.
 *
 * The glyph and color come from the account's settings (the shared
 * ACCOUNT_ICONS / ACCOUNT_COLORS vocabularies); an unset icon falls back to the
 * mail glyph and an unset color to a neutral badge. Colors reuse the Tag-chip
 * palette hues so the surfaces feel of a piece.
 */

import { cn } from '../lib/utils.js'
import {
  type AccountColor,
  type AccountIcon as AccountIconName,
  isAccountColor,
  isAccountIcon,
} from '@twin-digital/grinbox-shared'
import {
  Bell,
  Briefcase,
  Building,
  Code,
  Flag,
  Heart,
  Home,
  Inbox,
  type LucideIcon,
  Mail,
  ShoppingCart,
  Star,
  User,
} from 'lucide-react'

/** Whitelisted glyph name → component. Only these names render (bounded bundle). */
const ICON_COMPONENTS: Record<AccountIconName, LucideIcon> = {
  mail: Mail,
  inbox: Inbox,
  briefcase: Briefcase,
  user: User,
  home: Home,
  star: Star,
  bell: Bell,
  building: Building,
  'shopping-cart': ShoppingCart,
  code: Code,
  flag: Flag,
  heart: Heart,
}

/** Color token → badge classes (Tag-palette hues). Literal strings for Tailwind. */
const COLOR_CLASSES: Record<AccountColor, string> = {
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
}

const NEUTRAL_CLASSES = 'bg-muted text-muted-foreground'

export function AccountIcon({
  accountId,
  name,
  icon,
  color,
  className,
}: {
  accountId: number
  /** Account display name, surfaced as the hover tooltip. */
  name?: string
  /** Glyph name; unknown/absent → mail. */
  icon?: string | null
  /** Color token; unknown/absent → neutral badge. */
  color?: string | null
  className?: string
}) {
  const Glyph = icon && isAccountIcon(icon) ? ICON_COMPONENTS[icon] : Mail
  const palette = color && isAccountColor(color) ? COLOR_CLASSES[color] : NEUTRAL_CLASSES
  const label = name ? `Account: ${name}` : `Account ${accountId}`
  return (
    <div
      className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', palette, className)}
      title={label}
      aria-label={label}
    >
      <Glyph className='h-4 w-4' />
    </div>
  )
}
