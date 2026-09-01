/**
 * Normalize a player name for last-resort matching: lowercase, strip punctuation and
 * generational suffixes, collapse whitespace. Mirrors the shape of db_playerids `merge_name`.
 */
export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
