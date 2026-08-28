export const DATA_SOURCES = ['sleeper', 'espn', 'nflverse', 'fantasypros'] as const

export type DataSource = (typeof DATA_SOURCES)[number]

export const isDataSource = (value: string): value is DataSource => (DATA_SOURCES as readonly string[]).includes(value)
