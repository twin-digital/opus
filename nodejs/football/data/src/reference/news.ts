export const NEWS_SOURCES = ['espn-news', 'sleeper-injury'] as const

export type NewsSource = (typeof NEWS_SOURCES)[number]

export const isNewsSource = (value: string): value is NewsSource => (NEWS_SOURCES as readonly string[]).includes(value)

export const NEWS_DIRECTIONS = ['improves', 'harms', 'unclear'] as const

export type NewsDirection = (typeof NEWS_DIRECTIONS)[number]

export const isNewsDirection = (value: string): value is NewsDirection =>
  (NEWS_DIRECTIONS as readonly string[]).includes(value)

export const NEWS_IMPACTS = ['low', 'med', 'high'] as const

export type NewsImpact = (typeof NEWS_IMPACTS)[number]

export const isNewsImpact = (value: string): value is NewsImpact => (NEWS_IMPACTS as readonly string[]).includes(value)
