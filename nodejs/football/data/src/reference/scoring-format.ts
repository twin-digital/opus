export const SCORING_FORMATS = ['std', 'half', 'ppr'] as const

export type ScoringFormat = (typeof SCORING_FORMATS)[number]

/** The app only handles regular season. */
export type SeasonType = 'REG'
