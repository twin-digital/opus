export interface TokenGroup {
  /** For example "Palette" or "Status". */
  name: string
  /** The kind of sample that the style guide draws. */
  kind: 'fill' | 'text' | 'radius' | 'shadow'
  /** Names of CSS custom properties, with no leading dashes. */
  tokens: readonly string[]
}

/**
 * The names and the groups of the design tokens. The values are in `styles/tokens.css`.
 * A test keeps the names here and the custom properties of that file the same.
 */
export const tokenGroups: readonly TokenGroup[] = [
  {
    name: 'Palette (fixed)',
    kind: 'fill',
    tokens: ['ink', 'wishfire', 'wishfire-deep', 'wisp', 'wisp-deep', 'moonlight', 'moonlight-deep', 'clay', 'mist'],
  },
  {
    name: 'Surfaces and lines',
    kind: 'fill',
    tokens: ['ground', 'surface', 'night', 'on-night', 'line', 'control-border'],
  },
  {
    name: 'Fills',
    kind: 'fill',
    tokens: ['maker', 'spirit', 'accent', 'success', 'warning', 'danger', 'info'],
  },
  {
    name: 'Text colors, on ground',
    kind: 'text',
    tokens: [
      'fg',
      'fg-muted',
      'maker-text',
      'spirit-text',
      'accent-text',
      'success-text',
      'warning-text',
      'danger-text',
      'info-text',
    ],
  },
  { name: 'Radius', kind: 'radius', tokens: ['radius-sm', 'radius-md', 'radius-lg'] },
  { name: 'Shadow', kind: 'shadow', tokens: ['shadow-sm', 'shadow-md'] },
]
