import { logger } from '../logger.js'
import { getAudioApi, type AudioApi } from './audio-context.js'
import { readSample } from './sample-store.js'

const log = logger.child({}, { msgPrefix: '[AUDIO] ' })

/**
 * Whoever started a sample sounding — a `Channel`, typically. Used only as an identity, so that
 * {@link SamplePlayer.stopAll} can silence one owner's voices without cutting off another's.
 */
export type SampleOwner = object

/**
 * Sample rate samples are decoded at. Playback resamples to whatever the output device runs at, so this only has to be
 * a sane rate, not the device's.
 */
const DecodeSampleRate = 44100

/**
 * Most voices allowed to sound at once; starting one beyond this stops the oldest. Samples run several seconds and
 * keys can be mashed faster than they finish, so an uncapped graph grows until the render thread cannot keep its
 * device buffer fed — and a starved output stream stalls all playback, not just the newest note.
 */
const MaxVoices = 32

/**
 * How long past a buffer's duration a voice is kept before its nodes are torn down.
 */
const CleanupMarginSeconds = 0.1

/**
 * How long after the output device refuses to open before it is tried again. Long enough that a machine with no audio
 * device logs a complaint twice a minute rather than one per key press; short enough that plugging a device in — or a
 * wedged one coming back — restores sound without restarting the app.
 */
const OutputRetryMs = 30_000

/**
 * How long the output context may sit in a non-running state, with resume() being asked for on every note, before the
 * stream is discarded. A stream its device has abandoned never comes back; a fresh one to a recovered device does.
 */
const StallDiscardMs = 10_000

/**
 * One sounding sample: its nodes, the timer that tears them down, and the owner set it is registered in.
 */
interface Voice {
  gain: GainNode
  source: AudioBufferSourceNode
  timer: ReturnType<typeof setTimeout>
  voices: Set<Voice>
}

/**
 * Plays one-shot samples through the Web Audio API. Decoding is memoized per sample name and kept off the playback
 * path entirely, so pressing a key does no I/O.
 */
export class SamplePlayer {
  private _api: AudioApi | undefined

  /**
   * Resolution of the Web Audio implementation, memoized so a machine without one reports it once rather than once per
   * sample.
   */
  private _apiLoad: Promise<AudioApi | undefined> | undefined

  private _buffers = new Map<string, AudioBuffer>()

  /**
   * Context used only to turn encoded bytes into `AudioBuffer`s. Offline, so the eager decode at startup does not
   * claim the machine's audio output device for a session that may never play a sample.
   */
  private _decoder: OfflineAudioContext | undefined

  /**
   * In-flight and completed decodes, keyed by sample name. Memoized so overlapping `load` calls — the eager warm-up at
   * startup and the load triggered by selecting a board — share one decode rather than racing.
   */
  private _decodes = new Map<string, Promise<void>>()

  /**
   * Audio output. Created on the first sample actually played and released by {@link close}, so a session that never
   * touches a sound board never opens the device.
   */
  private _output: AudioContext | undefined

  /**
   * When the output device last refused to open. Playback stays silent for {@link OutputRetryMs} afterwards, then
   * tries again — a transient device failure should cost a pause, not the rest of the session.
   */
  private _outputFailedAt: number | undefined

  /**
   * When the output context was first observed in a non-running state, so a stall that outlives
   * {@link StallDiscardMs} can be told apart from a momentary suspension.
   */
  private _stalledSince: number | undefined

  /**
   * Voices currently sounding, grouped by whoever started them.
   */
  private _voices = new Map<SampleOwner, Set<Voice>>()

  /**
   * The same voices in the order they started, oldest first, so the cap can steal the oldest.
   */
  private _playing: Voice[] = []

  /**
   * Last context state a note was dropped under, so a stalled stream is reported once per stall rather than per key.
   */
  private _reportedState: AudioContextState | undefined

  /**
   * Reads and decodes the named samples, skipping any already decoded or in flight. A sample that cannot be loaded is
   * logged and skipped, leaving the rest of the board playable; the promise resolves either way.
   */
  public load(names: readonly string[]): Promise<void> {
    return Promise.all(names.map((name) => this.decode(name))).then(() => undefined)
  }

  private api(): Promise<AudioApi | undefined> {
    this._apiLoad ??= getAudioApi().then(
      (api) => {
        this._api = api
        return api
      },
      (error: unknown) => {
        log.warn(`No audio support is available, so sound boards will be silent. [error=${String(error)}]`)
        return undefined
      },
    )

    return this._apiLoad
  }

  private decode(name: string): Promise<void> {
    let decode = this._decodes.get(name)
    if (decode === undefined) {
      decode = this.read(name)
      this._decodes.set(name, decode)
    }

    return decode
  }

  private async read(name: string): Promise<void> {
    const api = await this.api()
    if (api === undefined) {
      return
    }

    let encoded: ArrayBuffer
    try {
      encoded = await readSample(name)
    } catch (error) {
      log.warn(
        `Sample is not on disk. Run 'music-fetch-samples' to download the sound-board samples. [sample=${name}, error=${String(error)}]`,
      )
      return
    }

    try {
      this._decoder ??= new api.OfflineAudioContext(1, 1, DecodeSampleRate)
      this._buffers.set(name, await this._decoder.decodeAudioData(encoded))
    } catch (error) {
      log.warn(`Unable to decode sample. [sample=${name}, error=${String(error)}]`)
    }
  }

  /**
   * Sounds a sample immediately.
   *
   * This never waits on a decode. A sample that is not yet in memory is dropped and its decode started, because a
   * sound arriving whenever I/O happens to finish — potentially after the key is released — is worse than silence.
   * Callers warm the cache ahead of time (see {@link load}), so a miss should not happen in practice.
   * @param name Sample to sound.
   * @param gain Gain to sound it at, 0-1. Clamped to that range.
   * @param owner Who is playing it, so {@link stopAll} can silence this voice without touching anyone else's.
   */
  public play(name: string, gain: number, owner: SampleOwner) {
    const buffer = this._buffers.get(name)
    if (this._api === undefined || buffer === undefined) {
      void this.decode(name)
      return
    }

    if (this._outputFailedAt !== undefined && Date.now() - this._outputFailedAt < OutputRetryMs) {
      return
    }

    // play() never throws: any audio failure degrades to silence, since it runs inside MIDI- and UI-event handlers.
    try {
      // The output device opens here, on the first sample actually played — the earliest point a missing device can
      // be observed, since decoding needs none.
      this._output ??= new this._api.AudioContext()
      const output = this._output

      if (output.state !== 'running') {
        // A context that is not running has a stopped clock: a source started on it is never heard and never ends, so
        // its nodes would pile up for as long as the program runs. Ask for the context back and drop this note.
        this._stalledSince ??= Date.now()
        if (this._reportedState !== output.state) {
          this._reportedState = output.state
          log.warn(`Audio output is not running; dropping notes until it resumes. [state=${output.state}]`)
        }

        if (Date.now() - this._stalledSince >= StallDiscardMs) {
          // The stream has ignored every resume() for the whole stall; its device has abandoned it. Discard it — the
          // next note opens a fresh stream, which reaches a recovered device where the wedged one never would.
          log.warn('Audio output stayed stalled; discarding the stream to open a fresh one.')
          this._stalledSince = undefined
          this._output = undefined

          const playing = [...this._playing]
          playing.forEach((voice) => {
            this.release(voice)
          })

          void output.close().catch(() => undefined)
          return
        }

        void output.resume().catch((error: unknown) => {
          log.warn(`Unable to start audio output. [error=${String(error)}]`)
        })
        return
      }

      this._stalledSince = undefined
      if (this._reportedState !== undefined) {
        this._reportedState = undefined
        log.info('Audio output is running again.')
      }

      // Steal the oldest voice rather than grow the graph past the cap.
      while (this._playing.length >= MaxVoices) {
        const oldest = this._playing[0]
        oldest.source.stop()
        this.release(oldest)
      }

      const source = output.createBufferSource()
      source.buffer = buffer

      const gainNode = output.createGain()
      gainNode.gain.value = Math.min(1, Math.max(0, gain))

      source.connect(gainNode)
      gainNode.connect(output.destination)

      const voices = this._voices.get(owner) ?? new Set<Voice>()
      this._voices.set(owner, voices)

      // Started before registration: `stop()` on a never-started source throws, so a registered voice must be one
      // that {@link stopAll} can safely stop.
      source.start()

      // Teardown is scheduled from the buffer's own duration instead of the source's 'ended' event. Registering any
      // listener on a source keeps the node alive in the render graph forever (ircam-ismm/node-web-audio-api#168), so
      // under sustained playing the graph grew with every note until the output device starved — taking down every
      // process using the device, not just this one.
      const voice: Voice = {
        gain: gainNode,
        source,
        voices,
        timer: setTimeout(
          () => {
            this.release(voice)
          },
          (buffer.duration + CleanupMarginSeconds) * 1000,
        ),
      }

      voices.add(voice)
      this._playing.push(voice)
      this._outputFailedAt = undefined
    } catch (error) {
      this._outputFailedAt = Date.now()
      log.warn(
        `Unable to open the audio output device; sound boards will be silent while it is retried. [error=${String(error)}]`,
      )
    }
  }

  /**
   * Removes a voice: its teardown timer, its registrations, and its nodes' connections.
   */
  private release(voice: Voice) {
    clearTimeout(voice.timer)
    voice.voices.delete(voice)

    const at = this._playing.indexOf(voice)
    if (at >= 0) {
      this._playing.splice(at, 1)
    }

    voice.source.disconnect()
    voice.gain.disconnect()
  }

  /**
   * Silences samples currently sounding: one owner's, or every one of them if no owner is named.
   * @param owner Whose voices to silence. Omit to silence all of them.
   */
  public stopAll(owner?: SampleOwner) {
    const groups = owner === undefined ? [...this._voices.values()] : [this._voices.get(owner)]

    groups.forEach((voices) => {
      const stopping = [...(voices ?? [])]
      stopping.forEach((voice) => {
        voice.source.stop()
        this.release(voice)
      })
    })
  }

  /**
   * Silences everything and releases the audio output device. Callers must not use the player afterwards.
   *
   * Without this, the audio render thread's handles keep Node's event loop alive — so the process never exits — and
   * the output device stays claimed against whatever else on the machine wants it.
   */
  public async close(): Promise<void> {
    const output = this._output
    this._output = undefined

    // Never rejects; shutdown fires and forgets it.
    try {
      this.stopAll()
      await output?.close()
    } catch (error) {
      log.warn(`Unable to release the audio output device cleanly. [error=${String(error)}]`)
    }
  }
}
