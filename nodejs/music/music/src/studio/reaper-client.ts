/**
 * Client for REAPER's built-in web remote (Preferences > Control/OSC/web > Web browser interface).
 *
 * Commands are sent as `GET /_/<cmd>;<cmd>;...`. Numeric commands run actions by command id, and
 * `SET/POS/<seconds>` moves the edit cursor. State queries (`TRANSPORT`, `REGION`, `TRACK`) reply
 * with tab-separated lines, one record per line.
 */

export const ReaperActions = {
  play: '1007',
  record: '1013',
  stop: '1016',
  goToProjectEnd: '40043',
} as const

export type ReaperPlayState = 'stopped' | 'playing' | 'paused' | 'recording'

export interface ReaperRegion {
  id: string
  name: string
  start: number
  end: number
}

export interface ReaperStatus {
  playState: ReaperPlayState
  /** Play position while playing or recording, otherwise the edit cursor. */
  position: number
  /** Regions in project order. */
  regions: ReaperRegion[]
  /** Loudest last-meter peak across all tracks, in dB. `-Infinity` when unmetered. */
  peakDb: number
  /** Every track's last-meter peak in dB, master first, in project order. */
  tracks: { name: string; peakDb: number; master: boolean }[]
  /** Project ext-state values the status query asks for, keyed by lower-cased key. */
  ext: Record<string, string>
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; text(): Promise<string> }>

const DEFAULT_TIMEOUT_MS = 2000

const toSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid position: ${String(seconds)}`)
  }
  return `SET/POS/${seconds.toFixed(3)}`
}

/** Ext-state section the watcher publishes under, and the keys the status query reads. */
export const EXT_SECTION = 'Studio'
export const STATUS_EXT_KEYS = ['project_name', 'watcher_version', 'watcher_hash'] as const

const STATUS_QUERY = [
  'TRANSPORT',
  'REGION',
  'TRACK',
  ...STATUS_EXT_KEYS.map((key) => `GET/PROJEXTSTATE/${EXT_SECTION}/${key}`),
]

// REAPER's TRANSPORT playstate: bit 0 play, bit 1 pause, bit 2 record
const decodePlayState = (flags: number): ReaperPlayState =>
  (flags & 4) !== 0 ? 'recording'
  : (flags & 2) !== 0 ? 'paused'
  : (flags & 1) !== 0 ? 'playing'
  : 'stopped'

export const parseReaperReply = (text: string): ReaperStatus => {
  const status: ReaperStatus = {
    playState: 'stopped',
    position: 0,
    regions: [],
    peakDb: -Infinity,
    tracks: [],
    ext: {},
  }

  for (const line of text.split('\n')) {
    const fields = line.split('\t')
    switch (fields[0]) {
      case 'TRANSPORT':
        status.playState = decodePlayState(Number(fields[1]))
        status.position = Number.isFinite(Number(fields[2])) ? Number(fields[2]) : 0
        break
      case 'REGION': {
        const start = Number(fields[3])
        const end = Number(fields[4])
        // a truncated line must not become a NaN seek later
        if (Number.isFinite(start) && Number.isFinite(end)) {
          status.regions.push({ name: fields[1] ?? '', id: fields[2] ?? '', start, end })
        }
        break
      }
      case 'TRACK': {
        // peaks arrive as tenths of a dB; track 0 is the master, whose peak is the mix, not the input
        const peak = Number(fields[6]) / 10
        const master = fields[1] === '0'
        if (Number.isFinite(peak)) {
          status.tracks.push({ name: master ? 'Master' : (fields[2] ?? ''), peakDb: peak, master })
          if (!master) {
            status.peakDb = Math.max(status.peakDb, peak)
          }
        }
        break
      }
      case 'PROJEXTSTATE':
        // REAPER echoes the section and key as asked; keys are matched case-insensitively
        if ((fields[1] ?? '').toLowerCase() === EXT_SECTION.toLowerCase()) {
          // ASCII trim only: the watcher's file names keep any other whitespace
          status.ext[(fields[2] ?? '').toLowerCase()] = fields
            .slice(3)
            .join('\t')
            .replace(/^[ \t\r\n\v\f]+|[ \t\r\n\v\f]+$/g, '')
        }
        break
      default:
        break
    }
  }

  return status
}

export class ReaperClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor({
    baseUrl = 'http://localhost:8080',
    fetch: fetchImpl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    /** Origin of the web remote, with scheme, e.g. `http://localhost:8080`. */
    baseUrl?: string
    fetch?: FetchLike
    /** A reply slower than this counts as REAPER being unreachable. */
    timeoutMs?: number
  } = {}) {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`REAPER base URL must start with http:// or https://: ${baseUrl}`)
    }
    this.baseUrl = url.href.replace(/\/+$/, '')
    this.fetchImpl = fetchImpl ?? ((url, { signal }) => fetch(url, { cache: 'no-store', signal }))
    this.timeoutMs = timeoutMs
  }

  /** Sends commands in one request so REAPER applies them in order. */
  async send(commands: string[]): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/_/${commands.join(';')}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`REAPER web remote request failed: ${commands.join(';')}`)
    }
    return response.text()
  }

  async getStatus(): Promise<ReaperStatus> {
    return parseReaperReply(await this.send(STATUS_QUERY))
  }

  async runActions(...actions: string[]): Promise<void> {
    await this.send(actions)
  }

  /** Writes a project ext-state value (`GET/PROJEXTSTATE` reads it back; an empty value deletes the key). */
  async setProjExtState(section: string, key: string, value: string): Promise<void> {
    await this.send([`SET/PROJEXTSTATE/${section}/${key}/${encodeURIComponent(value)}`])
  }

  async setPosition(seconds: number): Promise<void> {
    await this.send([toSeconds(seconds)])
  }

  /** Stops, seeks, and plays as one request so no frame is rendered at the old position. */
  async playFrom(seconds: number): Promise<void> {
    await this.send([ReaperActions.stop, toSeconds(seconds), ReaperActions.play])
  }

  /** Stops, seeks (or jumps to the project end when no position is given), and records. */
  async recordAt(seconds?: number): Promise<void> {
    const seek = seconds === undefined ? ReaperActions.goToProjectEnd : toSeconds(seconds)
    await this.send([ReaperActions.stop, seek, ReaperActions.record])
  }
}
