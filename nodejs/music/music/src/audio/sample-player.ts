import { logger } from '../logger.js'
import { normalizeMidiByte } from '../midi/normalize-midi-byte.js'
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
   * Sources currently sounding, grouped by whoever started them.
   */
  private _voices = new Map<SampleOwner, Set<AudioBufferSourceNode>>()

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
   * Sounds a sample immediately, at a gain taken from the note's velocity and the channel's level.
   *
   * This never waits on a decode. A sample that is not yet in memory is dropped and its decode started, because a
   * sound arriving whenever I/O happens to finish — potentially after the key is released — is worse than silence.
   * Callers warm the cache ahead of time (see {@link load}), so a miss should not happen in practice.
   * @param name Sample to sound.
   * @param velocity Velocity of the note that triggered it, 0-127.
   * @param level Level of the channel it is sounding on, 0-127.
   * @param owner Who is playing it, so {@link stopAll} can silence this voice without touching anyone else's.
   */
  public play(name: string, velocity: number, level: number, owner: SampleOwner) {
    const buffer = this._buffers.get(name)
    if (this._api === undefined || buffer === undefined) {
      void this.decode(name)
      return
    }

    // Opening the output device is deferred to here: the first sample anyone actually plays.
    this._output ??= new this._api.AudioContext()
    const output = this._output

    if (output.state !== 'running') {
      // A browser context not created inside a user gesture starts suspended, and a suspended context's clock does not
      // advance: a source started on it is never heard and never ends, so its nodes would pile up for as long as the
      // program runs. Ask for the context back and drop this note — the same bargain the decode path makes.
      void output.resume().catch((error: unknown) => {
        log.warn(`Unable to start audio output. [error=${String(error)}]`)
      })
      return
    }

    const source = output.createBufferSource()
    source.buffer = buffer

    const gain = output.createGain()
    gain.gain.value = (normalizeMidiByte(velocity) / 127) * (normalizeMidiByte(level) / 127)

    source.connect(gain)
    gain.connect(output.destination)

    const voices = this._voices.get(owner) ?? new Set<AudioBufferSourceNode>()
    this._voices.set(owner, voices)

    source.onended = () => {
      voices.delete(source)
      source.disconnect()
      gain.disconnect()
    }

    voices.add(source)
    source.start()
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
   * Silences everything and releases the audio output device. The player is not reusable afterwards.
   *
   * Without this, the audio render thread's handles keep Node's event loop alive — so the process never exits — and
   * the output device stays claimed against whatever else on the machine wants it.
   */
  public async close(): Promise<void> {
    this.stopAll()

    const output = this._output
    this._output = undefined

    await output?.close()
  }
}
