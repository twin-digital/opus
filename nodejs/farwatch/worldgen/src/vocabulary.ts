/**
 * Starter tag vocabulary — a deliberately small, throwaway stand-in for the real
 * genome (Open Q#3, unresolved). Just enough to theme a founding and judge the feel;
 * the spike exists partly to inform what the real axes and density should be.
 */

/** Domain axis — competence / action-kind. What a seeker can do, what a quest demands. */
export const DOMAINS = ['exploration', 'combat', 'magic', 'art', 'diplomacy', 'craft', 'lore'] as const
export type Domain = (typeof DOMAINS)[number]

/** Temperament axis — disposition (agents only). */
export const TEMPERAMENTS = [
  'zealous',
  'cautious',
  'curious',
  'ruthless',
  'devout',
  'restless',
  'stoic',
  'cunning',
  'gentle',
  'proud',
  'haunted',
  'kind',
] as const
export type Temperament = (typeof TEMPERAMENTS)[number]
