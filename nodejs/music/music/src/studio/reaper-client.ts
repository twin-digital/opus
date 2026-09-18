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
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>

const STATUS_QUERY = ['TRANSPORT', 'REGION', 'TRACK']

// REAPER's TRANSPORT playstate: bit 0 play, bit 1 pause, bit 2 record
const decodePlayState = (flags: number): ReaperPlayState =>
  (flags & 4) !== 0 ? 'recording'
  : (flags & 2) !== 0 ? 'paused'
  : (flags & 1) !== 0 ? 'playing'
  : 'stopped'

export const parseReaperReply = (text: string): ReaperStatus => {
  const status: ReaperStatus = { playState: 'stopped', position: 0, regions: [], peakDb: -Infinity }

  for (const line of text.split('\n')) {
    const fields = line.split('\t')
    switch (fields[0]) {
      case 'TRANSPORT':
        status.playState = decodePlayState(Number(fields[1]))
        status.position = Number(fields[2])
        break
      case 'REGION':
        status.regions.push({
          name: fields[1] ?? '',
          id: fields[2] ?? '',
          start: Number(fields[3]),
          end: Number(fields[4]),
        })
        break
      case 'TRACK': {
        // track 0 is the master; its peak is the mix, not the input signal
        const peak = Number(fields[6])
        if (fields[1] !== '0' && Number.isFinite(peak)) {
          status.peakDb = Math.max(status.peakDb, peak)
        }
        break
      }
      default:
        break
    }
  }

  return status
}

export class ReaperClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike

  constructor({ baseUrl = 'http://localhost:8080', fetch: fetchImpl }: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl ?? ((url) => fetch(url, { cache: 'no-store' }))
  }

  /** Sends commands in one request so REAPER applies them in order. */
  async send(commands: string[]): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/_/${commands.join(';')}`)
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

  async setPosition(seconds: number): Promise<void> {
    await this.send([`SET/POS/${seconds.toFixed(3)}`])
  }

  /** Stops, seeks, and plays as one request so no frame is rendered at the old position. */
  async playFrom(seconds: number): Promise<void> {
    await this.send([ReaperActions.stop, `SET/POS/${seconds.toFixed(3)}`, ReaperActions.play])
  }

  /** Stops, seeks (or jumps to the project end when no position is given), and records. */
  async recordAt(seconds?: number): Promise<void> {
    const seek = seconds === undefined ? ReaperActions.goToProjectEnd : `SET/POS/${seconds.toFixed(3)}`
    await this.send([ReaperActions.stop, seek, ReaperActions.record])
  }
}
