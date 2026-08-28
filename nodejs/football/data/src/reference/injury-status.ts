import { UnknownReferenceValueError } from './errors.js'

export const INJURY_STATUSES = [
  'ACTIVE',
  'QUESTIONABLE',
  'DOUBTFUL',
  'OUT',
  'IR',
  'PUP',
  'SUSPENDED',
  'UNKNOWN',
] as const

export type InjuryStatus = (typeof INJURY_STATUSES)[number]

const SLEEPER_INJURY_STATUSES: Record<string, InjuryStatus> = {
  Questionable: 'QUESTIONABLE',
  Doubtful: 'DOUBTFUL',
  Out: 'OUT',
  IR: 'IR',
  PUP: 'PUP',
  Sus: 'SUSPENDED',
  NA: 'UNKNOWN',
  DNR: 'UNKNOWN',
  COV: 'UNKNOWN',
}

export const injuryStatusFromSleeper = (status: string | null | undefined): InjuryStatus => {
  if (status === null || status === undefined || status === '') {
    return 'ACTIVE'
  }
  const canonical: InjuryStatus | undefined = SLEEPER_INJURY_STATUSES[status]
  if (canonical === undefined) {
    throw new UnknownReferenceValueError('InjuryStatus', 'sleeper', status)
  }
  return canonical
}

const ESPN_INJURY_STATUSES: Record<string, InjuryStatus> = {
  ACTIVE: 'ACTIVE',
  QUESTIONABLE: 'QUESTIONABLE',
  DOUBTFUL: 'DOUBTFUL',
  OUT: 'OUT',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUSPENDED',
  PHYSICALLY_UNABLE_TO_PERFORM: 'PUP',
  DAY_TO_DAY: 'QUESTIONABLE',
}

/** ESPN: unknown values map to UNKNOWN and are logged by the caller (per the design doc). */
export const injuryStatusFromEspn = (
  status: string | null | undefined,
  onUnknown?: (value: string) => void,
): InjuryStatus => {
  if (status === null || status === undefined || status === '') {
    return 'UNKNOWN'
  }
  const canonical: InjuryStatus | undefined = ESPN_INJURY_STATUSES[status]
  if (canonical === undefined) {
    onUnknown?.(status)
    return 'UNKNOWN'
  }
  return canonical
}
