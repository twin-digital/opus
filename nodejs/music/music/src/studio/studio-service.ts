import type { TypedEventEmitter } from '../typed-event-emitter.js'
import { Events } from '../typed-event-emitter.js'
import { logger } from '../logger.js'
import { ReaperActions, ReaperClient, type ReaperRegion, type ReaperStatus } from './reaper-client.js'

/** A recording, as marked by a region in the REAPER project. */
export interface Take {
  id: string
  name: string
  start: number
  end: number
  duration: number
}

export type StudioTransport = 'stopped' | 'playing' | 'recording'

export interface StudioState {
  /** False when REAPER is unreachable; the rest of the state is then stale. */
  connected: boolean
  transport: StudioTransport
  /** Seconds since recording started, 0 when not recording. */
  recordingElapsed: number
  /** Input level, 0..1, derived from the loudest track peak. */
  level: number
  /** Newest first. */
  takes: Take[]
  /** The take being played, when playback was started through this service. */
  playingTake: Take | undefined
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type StudioEventMap = {
  change: (state: StudioState) => void
}

/** Silence between takes on the timeline, so each one is visually distinct. */
const TAKE_GAP_SECONDS = 2
const METER_FLOOR_DB = -60

const toTake = (region: ReaperRegion): Take => ({
  id: region.id,
  name: region.name,
  start: region.start,
  end: region.end,
  duration: region.end - region.start,
})

const toLevel = (peakDb: number) => Math.min(1, Math.max(0, (peakDb - METER_FLOOR_DB) / -METER_FLOOR_DB))

/**
 * Single owner of the studio's REAPER session. Polls the web remote, keeps one snapshot of
 * transport and takes for every view (Launchpad overlay, touch page), and exposes the three
 * things the kid can do: record a new take, stop, play a take back.
 *
 * Takes are the project's regions; a background ReaScript creates one per recording. Recording
 * always appends after the last take so the timeline reads as a diary.
 */
export class StudioService {
  readonly events: TypedEventEmitter<StudioEventMap> = new Events<StudioEventMap>()

  private readonly client: ReaperClient
  private readonly pollIntervalMs: number
  private readonly log = logger.child({}, { msgPrefix: '[STUDIO] ' })

  private state: StudioState = {
    connected: false,
    transport: 'stopped',
    recordingElapsed: 0,
    level: 0,
    takes: [],
    playingTake: undefined,
  }
  private recordingStartedAt: number | undefined
  private running = false
  private handle: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | undefined
  private commandSeq = 0

  constructor({ client, pollIntervalMs = 150 }: { client?: ReaperClient; pollIntervalMs?: number } = {}) {
    this.client = client ?? new ReaperClient()
    this.pollIntervalMs = pollIntervalMs
  }

  getState(): StudioState {
    return this.state
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.schedule(0)
  }

  stop() {
    this.running = false
    clearTimeout(this.handle)
    this.handle = undefined
  }

  /** Starts a new take after the last one (or at the project end when there are none). */
  async record(): Promise<void> {
    const lastEnd = this.state.takes.reduce((end, take) => Math.max(end, take.end), -Infinity)
    this.setPlayingTake(undefined)
    await this.command(() => this.client.recordAt(lastEnd === -Infinity ? undefined : lastEnd + TAKE_GAP_SECONDS))
  }

  async stopTransport(): Promise<void> {
    this.setPlayingTake(undefined)
    await this.command(() => this.client.runActions(ReaperActions.stop))
  }

  async playTake(id: string): Promise<void> {
    const take = this.state.takes.find((candidate) => candidate.id === id)
    if (take === undefined) {
      this.log.warn(`No take with id ${id}.`)
      return
    }
    this.setPlayingTake(take)
    await this.command(() => this.client.playFrom(take.start))
  }

  async playLatest(): Promise<void> {
    const latest = this.state.takes.at(0)
    if (latest !== undefined) {
      await this.playTake(latest.id)
    }
  }

  /** Toggles between recording and stopped, for single-button surfaces. */
  async toggleRecord(): Promise<void> {
    await (this.state.transport === 'recording' ? this.stopTransport() : this.record())
  }

  /** Toggles playback of the latest take, for single-button surfaces. */
  async togglePlayLatest(): Promise<void> {
    await (this.state.transport === 'playing' ? this.stopTransport() : this.playLatest())
  }

  /** Fetches REAPER's state once and folds it into the snapshot. */
  async refresh(): Promise<void> {
    // one poll at a time, so a slow REAPER doesn't stack requests
    this.inFlight ??= this.doRefresh().finally(() => {
      this.inFlight = undefined
    })
    await this.inFlight
  }

  private async command(run: () => Promise<void>) {
    this.commandSeq += 1
    try {
      await run()
    } catch (error) {
      this.log.warn(error, 'REAPER command failed.')
      this.update({ connected: false })
      return
    }
    await this.refresh()
  }

  private async doRefresh() {
    const seq = this.commandSeq
    let status: ReaperStatus
    try {
      status = await this.client.getStatus()
    } catch (error) {
      if (this.state.connected) {
        this.log.warn(error, 'REAPER is unreachable.')
      }
      this.update({ connected: false })
      return
    }

    const transport: StudioTransport =
      status.playState === 'recording' ? 'recording'
      : status.playState === 'playing' ? 'playing'
      : 'stopped'

    if (transport === 'recording') {
      this.recordingStartedAt ??= status.position
    } else {
      this.recordingStartedAt = undefined
    }

    const takes = status.regions.map(toTake).sort((a, b) => b.start - a.start)
    const { playingTake } = this.state
    // a poll that started before the latest command reflects the old transport; it must not clear the take
    const stale = seq !== this.commandSeq
    const reachedEnd = playingTake !== undefined && transport === 'playing' && status.position >= playingTake.end
    const stillPlaying = playingTake !== undefined && (stale || (transport === 'playing' && !reachedEnd))

    this.update({
      connected: true,
      transport,
      recordingElapsed: this.recordingStartedAt === undefined ? 0 : status.position - this.recordingStartedAt,
      level: transport === 'stopped' ? 0 : toLevel(status.peakDb),
      takes,
      playingTake: stillPlaying ? (takes.find((take) => take.id === playingTake.id) ?? playingTake) : undefined,
    })

    if (reachedEnd) {
      await this.client.runActions(ReaperActions.stop).catch((error: unknown) => {
        this.log.warn(error, 'Failed to stop at the end of the take.')
      })
    }
  }

  private setPlayingTake(playingTake: Take | undefined) {
    this.update({ playingTake })
  }

  private update(patch: Partial<StudioState>) {
    this.state = { ...this.state, ...patch }
    this.events.emit('change', this.state)
  }

  private schedule(delayMs: number) {
    this.handle = setTimeout(() => {
      void this.tick()
    }, delayMs)
  }

  private async tick() {
    const startedAt = Date.now()
    await this.refresh()
    if (this.running) {
      this.schedule(Math.max(0, this.pollIntervalMs - (Date.now() - startedAt)))
    }
  }
}
