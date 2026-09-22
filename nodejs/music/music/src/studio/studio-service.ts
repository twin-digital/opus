import type { TypedEventEmitter } from '../typed-event-emitter.js'
import { Events } from '../typed-event-emitter.js'
import { logger } from '../logger.js'
import { ReaperActions, ReaperClient, type ReaperRegion, type ReaperStatus } from './reaper-client.js'
import type { InstrumentSelection } from '../app/sound-picker/sound-picker-program.js'
import { helperStatus, type HelperStatus } from './helper.js'

/** A recording, as marked by a region in the REAPER project. */
export interface Take {
  id: string
  /** Full region name, e.g. "Clip 7 - Sep 21, 04:12 PM". */
  name: string
  /** Clip number from the name, when the watcher named it. */
  number: number | undefined
  /** The part after the number: the timestamp, or whatever it was renamed to. */
  label: string
  start: number
  end: number
  duration: number
}

/** Splits a watcher-named region into its number and label; a foreign name is all label. */
export const parseTakeName = (name: string): { number: number | undefined; label: string } => {
  const match = /^(?:Clip|Take) (\d+)(?:\s*-\s*(.*))?$/.exec(name)
  if (match === null) {
    return { number: undefined, label: name }
  }
  return { number: Number(match[1]), label: match.at(2) ?? '' }
}

/** Longest label a clip can be given from a view. */
export const MAX_LABEL_LENGTH = 40

/** Trims a label to something a region name can carry through the web remote: no control characters or separators. */
export const sanitizeLabel = (label: string): string =>
  label
    .replace(/[\p{Cc}/;]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_LENGTH)

export type StudioTransport = 'stopped' | 'playing' | 'recording'

export interface StudioState {
  /** False when REAPER is unreachable; the rest of the state is then stale. */
  connected: boolean
  transport: StudioTransport
  /** Seconds since recording started, 0 when not recording. */
  recordingElapsed: number
  /** Input level, 0..1, derived from the loudest track peak. */
  level: number
  /** Every track's level, 0..1, master last, in project order. Live input shows here even while stopped. */
  meters: { name: string; level: number }[]
  /** Seconds into the playing take, when one is playing through this service. */
  position: number
  /** Newest first. */
  takes: Take[]
  /** The take being played, when playback was started through this service. */
  playingTake: Take | undefined
  /** What the keyboard currently plays, when a program has reported it. */
  instruments: InstrumentSelection | undefined
  /** Name of the open REAPER project, when the watcher has published it. */
  projectName: string | undefined
  /** The watcher running inside REAPER, once it has published itself; undefined means none seen. */
  helper: HelperStatus | undefined
}

/** The part of the service a view needs; a preview can stand in a fake. */
export type StudioApi = Pick<
  StudioService,
  | 'events'
  | 'getState'
  | 'record'
  | 'stopTransport'
  | 'playLatest'
  | 'playTake'
  | 'toggleRecord'
  | 'togglePlayLatest'
  | 'renameTake'
  | 'seekTake'
  | 'reloadHelper'
  | 'setInstruments'
>

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type StudioEventMap = {
  change: (state: StudioState) => void
}

/**
 * Consecutive failed polls before REAPER counts as unreachable. A render inside REAPER blocks its
 * web remote for a few seconds; that must not flap the page to "offline" and back.
 */
const DISCONNECT_AFTER_MISSES = 3

/** Silence between takes on the timeline, so each one is visually distinct. */
const TAKE_GAP_SECONDS = 2
const METER_FLOOR_DB = -60
/** Project ext-state section the watcher reads rename requests from. */
const RENAME_SECTION = 'Studio'

/**
 * Newest first: by clip number (creation order, which survives the region being moved or recorded out of timeline
 * order), then by timeline position. A region without a number sorts after every numbered one.
 */
const byNewest = (a: Take, b: Take) => (b.number ?? -1) - (a.number ?? -1) || b.start - a.start

const toTake = (region: ReaperRegion): Take => ({
  id: region.id,
  name: region.name,
  ...parseTakeName(region.name),
  start: region.start,
  end: region.end,
  duration: region.end - region.start,
})

const toLevel = (peakDb: number) => Math.min(1, Math.max(0, (peakDb - METER_FLOOR_DB) / -METER_FLOOR_DB))

/**
 * Single owner of the studio's REAPER session. Polls the web remote, keeps one snapshot of
 * transport and takes that every view reads, and exposes the three
 * things the kid can do: record a new take, stop, play a take back.
 *
 * Takes are the project's regions; a background ReaScript creates one per recording. Recording
 * always appends after the last take so the timeline reads as a diary.
 */
export class StudioService {
  readonly events: TypedEventEmitter<StudioEventMap> = new Events<StudioEventMap>()

  private readonly client: ReaperClient
  private readonly pollIntervalMs: number
  /** Poll interval while recording or playing, so meters and the cursor move smoothly. */
  private readonly activePollIntervalMs: number
  private readonly log = logger.child({}, { msgPrefix: '[STUDIO] ' })

  private state: StudioState = {
    connected: false,
    transport: 'stopped',
    recordingElapsed: 0,
    level: 0,
    meters: [],
    position: 0,
    takes: [],
    playingTake: undefined,
    instruments: undefined,
    projectName: undefined,
    helper: undefined,
  }
  private readonly expectedHelperHash: string | undefined
  private recordingStartedAt: number | undefined
  private running = false
  private handle: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | undefined
  private commandSeq = 0
  private misses = 0
  private pendingCommand: Promise<void> | undefined
  private runId = 0
  /** The latest seek asked for while an earlier one is still settling; only it is sent. */
  private queuedSeek: { id: string; atSeconds: number } | undefined
  private seekEpoch = 0
  private seeking = false

  constructor({
    client,
    pollIntervalMs = 150,
    activePollIntervalMs = 50,
    expectedHelperHash,
  }: {
    client?: ReaperClient
    pollIntervalMs?: number
    activePollIntervalMs?: number
    /** Hash of the watcher this app ships; when given, the state reports whether REAPER runs that one. */
    expectedHelperHash?: string
  } = {}) {
    this.client = client ?? new ReaperClient()
    this.pollIntervalMs = pollIntervalMs
    this.activePollIntervalMs = activePollIntervalMs
    this.expectedHelperHash = expectedHelperHash
  }

  getState(): StudioState {
    return this.state
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.runId += 1
    this.schedule(0, this.runId)
  }

  stop() {
    this.running = false
    clearTimeout(this.handle)
    this.handle = undefined
  }

  /** True while a record/stop/play command (and its follow-up poll) is still in progress. */
  get busy(): boolean {
    return this.pendingCommand !== undefined
  }

  /** Starts a new take after the last one (or at the project end when there are none). */
  async record(): Promise<void> {
    const lastEnd = this.state.takes.reduce((end, take) => Math.max(end, take.end), -Infinity)
    this.dropSeeks()
    this.recordingStartedAt = undefined
    this.setPlayingTake(undefined)
    await this.command(() => this.client.recordAt(lastEnd === -Infinity ? undefined : lastEnd + TAKE_GAP_SECONDS))
  }

  async stopTransport(): Promise<void> {
    this.dropSeeks()
    this.setPlayingTake(undefined)
    await this.command(() => this.client.runActions(ReaperActions.stop))
  }

  /** Plays a take from its start, or from `atSeconds` into it. */
  async playTake(id: string, atSeconds = 0): Promise<void> {
    const take = this.state.takes.find((candidate) => candidate.id === id)
    if (take === undefined) {
      this.log.warn(`No take with id ${id}.`)
      return
    }
    const offset = Math.min(Math.max(0, atSeconds), Math.max(0, take.duration - 0.05))
    this.setPlayingTake(take)
    await this.command(() => this.client.playFrom(take.start + offset))
  }

  /**
   * Moves playback to `atSeconds` into the take. While that take is playing this is a seek
   * that keeps the transport rolling (REAPER follows a cursor move during playback); otherwise
   * it starts the take there.
   */
  async seekTake(id: string, atSeconds: number): Promise<void> {
    // scrubbing sends seeks faster than they settle: while one is in flight only the newest
    // waiting one is kept, so the cursor never replays the whole drag afterwards
    if (this.seeking) {
      this.queuedSeek = { id, atSeconds }
      return
    }
    this.seeking = true
    const epoch = this.seekEpoch
    try {
      let next: { id: string; atSeconds: number } | undefined = { id, atSeconds }
      while (next !== undefined && epoch === this.seekEpoch) {
        await this.seekOnce(next.id, next.atSeconds)
        next = this.queuedSeek
        this.queuedSeek = undefined
      }
    } finally {
      this.seeking = false
    }
  }

  /** A stop or record makes a waiting scrub moot; it must not replay afterwards. */
  private dropSeeks() {
    this.queuedSeek = undefined
    this.seekEpoch += 1
  }

  private async seekOnce(id: string, atSeconds: number): Promise<void> {
    const take = this.state.takes.find((candidate) => candidate.id === id)
    if (take === undefined) {
      return
    }
    // stay clear of the end: a seek right at it would end the take on the next poll
    const offset = Math.min(Math.max(0, atSeconds), Math.max(0, take.duration - 0.25))
    if (this.state.transport === 'playing' && this.state.playingTake?.id === id) {
      await this.command(() => this.client.setPosition(take.start + offset))
      return
    }
    await this.playTake(id, offset)
  }

  async playLatest(): Promise<void> {
    const latest = this.state.takes.at(0)
    if (latest !== undefined) {
      await this.playTake(latest.id)
    }
  }

  /**
   * Gives a clip a new label. The request is left in the project's ext state for the watcher, which renames the
   * region (keeping its "Clip N" prefix) and saves; the new name shows up on the next poll.
   */
  async renameTake(id: string, label: string): Promise<void> {
    const take = this.state.takes.find((candidate) => candidate.id === id)
    if (take === undefined) {
      this.log.warn(`No take with id ${id}.`)
      return
    }
    const clean = sanitizeLabel(label)
    if (clean === '') {
      return
    }
    await this.command(() => this.client.setProjExtState(RENAME_SECTION, `rename_${id}`, clean))
  }

  /** Asks the running watcher to reload itself from disk (after a newer file was installed). */
  async reloadHelper(): Promise<void> {
    await this.command(() => this.client.setProjExtState(RENAME_SECTION, 'reload', '1'))
  }

  /** Records what the keyboard is playing, for views that show it. */
  setInstruments(instruments: InstrumentSelection | undefined) {
    this.update({ instruments })
  }

  /**
   * Toggles between recording and stopped, for single-button surfaces. A press while a command is
   * still settling is ignored, so a double-tap doesn't restart the take.
   */
  async toggleRecord(): Promise<void> {
    if (this.busy) {
      return
    }
    await (this.state.transport === 'recording' ? this.stopTransport() : this.record())
  }

  /** Toggles playback of the latest take, for single-button surfaces; ignored while a command is settling. */
  async togglePlayLatest(): Promise<void> {
    if (this.busy) {
      return
    }
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

  /** Runs commands one at a time, each followed by a poll that started after the command landed. */
  private async command(run: () => Promise<void>) {
    const previous = this.pendingCommand
    const current = (async () => {
      await previous
      this.commandSeq += 1
      try {
        await run()
      } catch (error) {
        this.log.warn(error, 'REAPER command failed.')
        this.update({ connected: false, playingTake: undefined })
        return
      }
      // a poll already in flight answers from before the command; wait it out, then poll fresh
      while (this.inFlight !== undefined) {
        await this.inFlight
      }
      await this.refresh()
    })()
    this.pendingCommand = current
    try {
      await current
    } finally {
      if (this.pendingCommand === current) {
        this.pendingCommand = undefined
      }
    }
  }

  private async doRefresh() {
    const seq = this.commandSeq
    let status: ReaperStatus
    try {
      status = await this.client.getStatus()
    } catch (error) {
      this.misses += 1
      if (this.state.connected && this.misses < DISCONNECT_AFTER_MISSES) {
        return // a short stall (REAPER rendering, say); keep the last good state
      }
      if (this.state.connected) {
        this.log.warn(error, 'REAPER is unreachable.')
        // views show idle and the poll slows; what was playing or recording is remembered, since
        // REAPER may only have been busy for a few seconds and still be at it when polls resume
        this.update({ connected: false, transport: 'stopped', recordingElapsed: 0, level: 0, meters: [], position: 0 })
      }
      return
    }
    this.misses = 0

    const transport: StudioTransport =
      status.playState === 'recording' ? 'recording'
      : status.playState === 'playing' ? 'playing'
      : 'stopped'

    // a poll that started before the latest command answers from before it; it must not clear
    // the take or a recording start. Only a poll that closely follows the last may call the end
    // of a take: the first one after an outage may find the cursor anywhere
    const stale = seq !== this.commandSeq
    const consecutive = !stale && this.state.connected

    // a recording start is trusted only while the cursor is still past it (a new recording
    // started while REAPER was unreachable begins earlier)
    if (this.recordingStartedAt !== undefined && status.position < this.recordingStartedAt) {
      this.recordingStartedAt = undefined
    }
    if (transport === 'recording') {
      this.recordingStartedAt ??= status.position
    } else if (!stale) {
      this.recordingStartedAt = undefined
    }

    const takes = status.regions.map(toTake).sort(byNewest)
    // the take this service started is believed only while REAPER is playing inside it; past its
    // end playback is stopped, and anywhere else REAPER is doing something of its own
    const { playingTake } = this.state
    // the first poll after a play or a seek to the start can read a hair before it
    const inside =
      playingTake !== undefined &&
      transport === 'playing' &&
      status.position >= playingTake.start - 0.25 &&
      status.position < playingTake.end
    const stillPlaying = playingTake !== undefined && (stale || inside) ? playingTake : undefined
    const reachedEnd =
      consecutive && playingTake !== undefined && transport === 'playing' && status.position >= playingTake.end

    this.update({
      connected: true,
      transport,
      recordingElapsed: this.recordingStartedAt === undefined ? 0 : status.position - this.recordingStartedAt,
      level: toLevel(status.peakDb),
      meters: [...status.tracks.filter((track) => !track.master), ...status.tracks.filter((track) => track.master)].map(
        (track) => ({ name: track.name, level: toLevel(track.peakDb) }),
      ),
      position: stillPlaying === undefined ? 0 : Math.max(0, status.position - stillPlaying.start),
      takes,
      projectName: status.ext.project_name || undefined,
      helper: this.expectedHelperHash === undefined ? undefined : helperStatus(status.ext, this.expectedHelperHash),
      playingTake:
        stillPlaying === undefined ? undefined : (takes.find((take) => take.id === stillPlaying.id) ?? stillPlaying),
    })

    if (reachedEnd) {
      this.commandSeq += 1
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

  private schedule(delayMs: number, runId: number) {
    this.handle = setTimeout(() => {
      void this.tick(runId)
    }, delayMs)
  }

  private async tick(runId: number) {
    const startedAt = Date.now()
    await this.refresh()
    // a stop()/start() during the poll started a newer chain; this one ends here
    if (this.running && runId === this.runId) {
      const interval =
        this.state.connected && this.state.transport !== 'stopped' ? this.activePollIntervalMs : this.pollIntervalMs
      this.schedule(Math.max(0, interval - (Date.now() - startedAt)), runId)
    }
  }
}
