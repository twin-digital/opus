/**
 * The closed vocabularies for an Account's display badge — the icon glyph and
 * color a user picks in account settings, shown in the Inbox's hanging-indent
 * column and the account list/detail. Shared so the server validates writes
 * against the same set the web renders (the web maps each name to a lucide
 * component and each color to Tailwind classes; both must stay in lockstep with
 * these lists).
 *
 * Colors mirror the Tag-chip palette hues (Zinc/Violet scheme) so the two
 * surfaces feel of a piece. Both fields are optional on an Account; an unset
 * icon defaults to `mail` and an unset color to a neutral badge.
 */

/** Selectable account icons (lucide glyph names). */
export const ACCOUNT_ICONS = [
  'mail',
  'inbox',
  'briefcase',
  'user',
  'home',
  'star',
  'bell',
  'building',
  'shopping-cart',
  'code',
  'flag',
  'heart',
] as const

export type AccountIcon = (typeof ACCOUNT_ICONS)[number]

/** The default icon when an Account has none set. */
export const DEFAULT_ACCOUNT_ICON: AccountIcon = 'mail'

/** Selectable account colors (Tag-palette hues). */
export const ACCOUNT_COLORS = ['violet', 'sky', 'emerald', 'amber', 'rose', 'fuchsia', 'teal', 'indigo'] as const

export type AccountColor = (typeof ACCOUNT_COLORS)[number]

/** Whether `value` is a known account icon name. */
export function isAccountIcon(value: string): value is AccountIcon {
  return (ACCOUNT_ICONS as readonly string[]).includes(value)
}

/** Whether `value` is a known account color token. */
export function isAccountColor(value: string): value is AccountColor {
  return (ACCOUNT_COLORS as readonly string[]).includes(value)
}
