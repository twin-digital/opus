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
   * Set once the output device has refused to open, so the failure is reported once rather than on every key press.
   */
  private _outputUnavailable = false

  /**
   * Sources currently sounding, grouped by whoever started them.
   */
  private _voices = new Map<SampleOwner, Set<AudioBufferSourceNode>>()

  /**
   * The same sources in the order they started, oldest first, so the cap can steal the oldest voice.
   */
  private _playing: AudioBufferSourceNode[] = []

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
    if (this._api === undefined || this._outputUnavailable || buffer === undefined) {
      void this.decode(name)
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
        if (this._reportedState !== output.state) {
          this._reportedState = output.state
          log.warn(`Audio output is not running; dropping notes until it resumes. [state=${output.state}]`)
        }

        void output.resume().catch((error: unknown) => {
          log.warn(`Unable to start audio output. [error=${String(error)}]`)
        })
        return
      }

      if (this._reportedState !== undefined) {
        this._reportedState = undefined
        log.info('Audio output is running again.')
      }

      // Steal the oldest voice rather than grow the graph past the cap. It is dequeued here, synchronously — onended
      // (which also dequeues) fires asynchronously, so stopping without shifting would spin on the same voice.
      while (this._playing.length >= MaxVoices) {
        this._playing.shift()?.stop()
      }

      const source = output.createBufferSource()
      source.buffer = buffer

      const gainNode = output.createGain()
      gainNode.gain.value = Math.min(1, Math.max(0, gain))

      source.connect(gainNode)
      gainNode.connect(output.destination)

      const voices = this._voices.get(owner) ?? new Set<AudioBufferSourceNode>()
      this._voices.set(owner, voices)

      source.onended = () => {
        voices.delete(source)
        const at = this._playing.indexOf(source)
        if (at >= 0) {
          this._playing.splice(at, 1)
        }
        source.disconnect()
        gainNode.disconnect()
      }

      // Registered only after start() has succeeded: `stop()` on a never-started source throws, so a voice in this
      // set must be one that {@link stopAll} can safely stop. Web Audio events never fire synchronously, so onended
      // cannot race the registration.
      source.start()
      voices.add(source)
      this._playing.push(source)
    } catch (error) {
      this._outputUnavailable = true
      log.warn(`Unable to open the audio output device, so sound boards will be silent. [error=${String(error)}]`)
    }
  }

  /**
   * Silences samples currently sounding: one owner's, or every one of them if no owner is named.
   * @param owner Whose voices to silence. Omit to silence all of them.
   */
  public stopAll(owner?: SampleOwner) {
    const groups = owner === undefined ? [...this._voices.values()] : [this._voices.get(owner)]

    groups.forEach((voices) => {
      voices?.forEach((voice) => {
        voice.stop()
      })
      voices?.clear()
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
