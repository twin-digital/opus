import { parseCsvRecords } from './csv.js'
import { fetchText } from './http.js'

const CROSSWALK_URL = 'https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv'

/** One db_playerids row; empty CSV cells are normalized to null. */
export interface CrosswalkRow {
  gsisId: string | null
  sleeperId: string | null
  espnId: string | null
  fantasyprosId: string | null
  name: string | null
  mergeName: string | null
  position: string | null
  team: string | null
  age: number | null
  birthdate: string | null
  draftYear: number | null
}

const blankToNull = (value: string | undefined): string | null =>
  value === undefined || value === '' || value === 'NA' ? null : value

const numberOrNull = (value: string | undefined): number | null => {
  const text = blankToNull(value)
  if (text === null) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export const parseCrosswalkCsv = (csv: string): CrosswalkRow[] =>
  parseCsvRecords(csv).map((record) => ({
    gsisId: blankToNull(record.gsis_id),
    sleeperId: blankToNull(record.sleeper_id),
    espnId: blankToNull(record.espn_id),
    fantasyprosId: blankToNull(record.fantasypros_id),
    name: blankToNull(record.name),
    mergeName: blankToNull(record.merge_name),
    position: blankToNull(record.position),
    team: blankToNull(record.team),
    age: numberOrNull(record.age),
    birthdate: blankToNull(record.birthdate),
    draftYear: numberOrNull(record.draft_year),
  }))

export const fetchCrosswalk = async (): Promise<CrosswalkRow[]> => {
  const csv = await fetchText(CROSSWALK_URL)
  const rows = parseCrosswalkCsv(csv)
  if (rows.length === 0) {
    throw new Error('db_playerids.csv parsed to zero rows')
  }
  return rows
}
